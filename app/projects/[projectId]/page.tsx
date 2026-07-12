import { ProjectWorkspace } from "@/components/project-workspace";
import { requirePageUser } from "@/lib/server/auth/page-auth";

export default async function ProjectPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requirePageUser(`/projects/${encodeURIComponent(projectId)}`);

  return (
    <main className="container py-8">
      <ProjectWorkspace projectId={projectId} />
    </main>
  );
}
