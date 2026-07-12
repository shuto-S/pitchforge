import { z, type ZodTypeAny } from "zod";

export type GeminiJsonSchema = {
  type: "object" | "array" | "string" | "number" | "integer";
  properties?: Record<string, GeminiJsonSchema>;
  required?: string[];
  items?: GeminiJsonSchema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: string;
  maxLength?: string;
  minItems?: string;
  maxItems?: string;
};

function unsupported(schema: ZodTypeAny, path: string, detail?: string): never {
  const typeName = schema._def.typeName ?? schema.constructor.name;
  const suffix = detail ? ` (${detail})` : "";
  throw new Error(`Unsupported Zod schema for Gemini responseSchema at ${path}: ${typeName}${suffix}`);
}

function convertString(schema: z.ZodString, path: string): GeminiJsonSchema {
  const result: GeminiJsonSchema = { type: "string" };

  for (const check of schema._def.checks) {
    switch (check.kind) {
      case "min":
        result.minLength = String(check.value);
        break;
      case "max":
        result.maxLength = String(check.value);
        break;
      case "length":
        result.minLength = String(check.value);
        result.maxLength = String(check.value);
        break;
      default:
        unsupported(schema, path, `string check ${check.kind}`);
    }
  }

  return result;
}

function convertNumber(schema: z.ZodNumber, path: string): GeminiJsonSchema {
  const isInteger = schema._def.checks.some((check) => check.kind === "int");
  const result: GeminiJsonSchema = { type: isInteger ? "integer" : "number" };

  for (const check of schema._def.checks) {
    switch (check.kind) {
      case "int":
        break;
      case "min":
        if (check.inclusive) {
          result.minimum = isInteger ? Math.ceil(check.value) : check.value;
        } else if (isInteger) {
          result.minimum = Math.floor(check.value) + 1;
        } else {
          unsupported(schema, path, "exclusive minimum on a non-integer number");
        }
        break;
      case "max":
        if (check.inclusive) {
          result.maximum = isInteger ? Math.floor(check.value) : check.value;
        } else if (isInteger) {
          result.maximum = Math.ceil(check.value) - 1;
        } else {
          unsupported(schema, path, "exclusive maximum on a non-integer number");
        }
        break;
      default:
        unsupported(schema, path, `number check ${check.kind}`);
    }
  }

  return result;
}

function convertSchema(schema: ZodTypeAny, path: string): GeminiJsonSchema {
  if (schema instanceof z.ZodEffects) {
    if (schema._def.effect.type !== "refinement") {
      unsupported(schema, path, `effect ${schema._def.effect.type}`);
    }
    return convertSchema(schema.innerType(), path);
  }

  if (schema instanceof z.ZodObject) {
    const entries = Object.entries(schema.shape) as Array<[string, ZodTypeAny]>;
    const properties = Object.fromEntries(
      entries.map(([key, value]) => [key, convertSchema(value, `${path}.${key}`)])
    );
    return {
      type: "object",
      properties,
      required: entries.map(([key]) => key)
    };
  }

  if (schema instanceof z.ZodArray) {
    const result: GeminiJsonSchema = {
      type: "array",
      items: convertSchema(schema.element, `${path}[]`)
    };
    if (schema._def.exactLength) {
      result.minItems = String(schema._def.exactLength.value);
      result.maxItems = String(schema._def.exactLength.value);
    } else {
      if (schema._def.minLength) {
        result.minItems = String(schema._def.minLength.value);
      }
      if (schema._def.maxLength) {
        result.maxItems = String(schema._def.maxLength.value);
      }
    }
    return result;
  }

  if (schema instanceof z.ZodString) {
    return convertString(schema, path);
  }

  if (schema instanceof z.ZodNumber) {
    return convertNumber(schema, path);
  }

  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: [...schema.options] };
  }

  return unsupported(schema, path);
}

export function requireZodSchema(schema: unknown): ZodTypeAny {
  if (!(schema instanceof z.ZodType)) {
    throw new Error("Gemini responseSchema must be a Zod schema");
  }
  return schema;
}

export function zodToGeminiSchema(schema: unknown): GeminiJsonSchema {
  return convertSchema(requireZodSchema(schema), "$response");
}
