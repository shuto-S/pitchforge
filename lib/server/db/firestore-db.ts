import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Invite, UserProfile } from "@/lib/schemas/auth";
import { inviteSchema, projectSchema, userProfileSchema } from "@/lib/schemas";
import type { Asset, Project, Run, RunEvent } from "@/lib/schemas/project";
import { getRuntimeConfig } from "@/lib/server/config";
import type {
  CreateProjectInput,
  PitchForgeRepository,
  UpsertUserInput
} from "@/lib/server/db/types";
import { nowIso } from "@/lib/server/utils/dates";
import { makeId } from "@/lib/server/utils/ids";

type FirestoreDoc = Record<string, unknown>;
type FirestoreDocumentSnapshot = {
  exists: boolean;
  data(): FirestoreDoc;
};
type FirestoreQuerySnapshot = {
  docs: { data(): FirestoreDoc }[];
};
type FirestoreDocumentReference = {
  set(data: FirestoreDoc, options?: { merge: boolean }): Promise<void>;
  get(): Promise<FirestoreDocumentSnapshot>;
  collection(name: string): FirestoreCollectionReference;
};
type FirestoreCollectionReference = {
  doc(id: string): FirestoreDocumentReference;
  where(field: string, op: "==", value: unknown): FirestoreCollectionReference;
  orderBy(field: string, direction?: "asc" | "desc"): FirestoreCollectionReference;
  get(): Promise<FirestoreQuerySnapshot>;
};
type FirestoreClient = {
  collection(name: string): FirestoreCollectionReference;
};

export class FirestorePitchForgeRepository implements PitchForgeRepository {
  private dbPromise: Promise<FirestoreClient> | null = null;

  async createProject(input: CreateProjectInput): Promise<Project> {
    const db = await this.db();
    const createdAt = nowIso();
    const project: Project = projectSchema.parse({
      id: makeId("proj"),
      ...input,
      productUrl: input.productUrl || undefined,
      githubUrl: input.githubUrl || undefined,
      status: "ready",
      createdAt,
      updatedAt: createdAt
    });
    await this.collection(db, "projects").doc(project.id).set(project);
    return project;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const db = await this.db();
    const snap = await this.collection(db, "projects").doc(projectId).get();
    return snap.exists ? (snap.data() as Project) : null;
  }

  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    const db = await this.db();
    const ref = this.collection(db, "projects").doc(projectId);
    await ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
    const snap = await ref.get();
    if (!snap.exists) {
      throw new Error("Project not found");
    }
    return snap.data() as Project;
  }

  async listProjects(ownerUid: string): Promise<Project[]> {
    const db = await this.db();
    const snap = await this.collection(db, "projects").where("ownerUid", "==", ownerUid).get();
    return snap.docs
      .map((doc: { data: () => FirestoreDoc }) => projectSchema.parse(doc.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    const db = await this.db();
    await this.collection(db, "projects")
      .doc(asset.projectId)
      .collection("assets")
      .doc(asset.id)
      .set(asset);
    return asset;
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    const db = await this.db();
    const snap = await this.collection(db, "projects")
      .doc(projectId)
      .collection("assets")
      .orderBy("createdAt", "asc")
      .get();
    return snap.docs.map((doc: { data: () => FirestoreDoc }) => doc.data() as Asset);
  }

  async createRun(projectId: string): Promise<Run> {
    const db = await this.db();
    const now = nowIso();
    const run: Run = {
      id: makeId("run"),
      projectId,
      status: "queued",
      currentStep: "queued",
      progress: 0,
      startedAt: now,
      createdAt: now,
      updatedAt: now
    };
    await this.collection(db, "projects")
      .doc(projectId)
      .collection("runs")
      .doc(run.id)
      .set(run);
    return run;
  }

  async getRun(projectId: string, runId: string): Promise<Run | null> {
    const db = await this.db();
    const snap = await this.collection(db, "projects")
      .doc(projectId)
      .collection("runs")
      .doc(runId)
      .get();
    return snap.exists ? (snap.data() as Run) : null;
  }

  async listRuns(projectId: string): Promise<Run[]> {
    const db = await this.db();
    const snap = await this.collection(db, "projects")
      .doc(projectId)
      .collection("runs")
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((doc: { data: () => FirestoreDoc }) => doc.data() as Run);
  }

  async updateRun(projectId: string, runId: string, patch: Partial<Run>): Promise<Run> {
    const db = await this.db();
    const ref = this.collection(db, "projects").doc(projectId).collection("runs").doc(runId);
    await ref.set({ ...patch, updatedAt: nowIso() }, { merge: true });
    const snap = await ref.get();
    if (!snap.exists) {
      throw new Error("Run not found");
    }
    return snap.data() as Run;
  }

  async addRunEvent(event: RunEvent): Promise<RunEvent> {
    const db = await this.db();
    await this.collection(db, "projects")
      .doc(event.projectId)
      .collection("runs")
      .doc(event.runId)
      .collection("events")
      .doc(event.id)
      .set(event);
    return event;
  }

  async listRunEvents(projectId: string, runId: string): Promise<RunEvent[]> {
    const db = await this.db();
    const snap = await this.collection(db, "projects")
      .doc(projectId)
      .collection("runs")
      .doc(runId)
      .collection("events")
      .orderBy("createdAt", "asc")
      .get();
    return snap.docs.map((doc: { data: () => FirestoreDoc }) => doc.data() as RunEvent);
  }

  async saveArtifacts(
    projectId: string,
    runId: string,
    artifacts: ArtifactBundle
  ): Promise<void> {
    const db = await this.db();
    await this.collection(db, "projects")
      .doc(projectId)
      .collection("runs")
      .doc(runId)
      .collection("artifacts")
      .doc("final")
      .set(artifacts);
  }

  async getArtifacts(projectId: string, runId: string): Promise<ArtifactBundle | null> {
    const db = await this.db();
    const snap = await this.collection(db, "projects")
      .doc(projectId)
      .collection("runs")
      .doc(runId)
      .collection("artifacts")
      .doc("final")
      .get();
    return snap.exists ? (snap.data() as ArtifactBundle) : null;
  }

  async upsertUser(input: UpsertUserInput): Promise<UserProfile> {
    const db = await this.db();
    const ref = this.collection(db, "users").doc(input.uid);
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() as Partial<UserProfile>) : null;
    const now = nowIso();
    const user = userProfileSchema.parse({
      ...existing,
      ...input,
      email: normalizeEmail(input.email),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastLoginAt: now
    });
    await ref.set(user);
    return user;
  }

  async getUser(uid: string): Promise<UserProfile | null> {
    const db = await this.db();
    const snap = await this.collection(db, "users").doc(uid).get();
    return snap.exists ? userProfileSchema.parse(snap.data()) : null;
  }

  async createInvite(email: string, invitedByUid: string): Promise<Invite> {
    const db = await this.db();
    const normalizedEmail = normalizeEmail(email);
    const ref = this.collection(db, "invites").doc(inviteIdForEmail(normalizedEmail));
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data() as Partial<Invite>) : null;
    const now = nowIso();
    const invite = inviteSchema.parse({
      ...existing,
      id: inviteIdForEmail(normalizedEmail),
      email: normalizedEmail,
      status: existing?.status ?? "invited",
      invitedByUid: existing?.invitedByUid ?? invitedByUid,
      acceptedByUid: existing?.acceptedByUid,
      acceptedAt: existing?.acceptedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    await ref.set(invite);
    return invite;
  }

  async getInviteByEmail(email: string): Promise<Invite | null> {
    const db = await this.db();
    const snap = await this.collection(db, "invites").doc(inviteIdForEmail(email)).get();
    return snap.exists ? inviteSchema.parse(snap.data()) : null;
  }

  async acceptInvite(email: string, acceptedByUid: string): Promise<Invite> {
    const db = await this.db();
    const ref = this.collection(db, "invites").doc(inviteIdForEmail(email));
    const snap = await ref.get();
    if (!snap.exists) {
      throw new Error("Invite not found");
    }
    const now = nowIso();
    const invite = inviteSchema.parse({
      ...snap.data(),
      status: "accepted",
      acceptedByUid,
      acceptedAt: (snap.data() as Partial<Invite>).acceptedAt ?? now,
      updatedAt: now
    });
    await ref.set(invite);
    return invite;
  }

  async listInvites(): Promise<Invite[]> {
    const db = await this.db();
    const snap = await this.collection(db, "invites").orderBy("createdAt", "desc").get();
    return snap.docs.map((doc: { data: () => FirestoreDoc }) => inviteSchema.parse(doc.data()));
  }

  private async db(): Promise<FirestoreClient> {
    if (!this.dbPromise) {
      this.dbPromise = import("@google-cloud/firestore").then(({ Firestore }) => {
        const config = getRuntimeConfig();
        return new Firestore({
          projectId: config.googleCloudProject,
          databaseId: config.firestoreDatabaseId
        }) as unknown as FirestoreClient;
      });
    }
    return this.dbPromise;
  }

  private collection(db: FirestoreClient, name: string): FirestoreCollectionReference {
    return db.collection(name);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function inviteIdForEmail(email: string): string {
  return encodeURIComponent(normalizeEmail(email));
}
