/** Small, deliberately bounded JSON Schema vocabulary shared by discovery and validation. */
export interface Schema {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array'
  description?: string
  enum?: readonly (string | number | boolean)[]
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: false
  items?: Schema
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
}
export const str = (description?: string): Schema => ({ type: 'string', maxLength: 100000, description })
export const bool: Schema = { type: 'boolean' }
export const choice = (values: readonly string[], description?: string): Schema => ({ type: 'string', enum: values, description })
export const integer = (minimum: number, maximum: number): Schema => ({ type: 'integer', minimum, maximum })
export const array = (items: Schema, maxItems = 100): Schema => ({ type: 'array', items, maxItems })
export const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: 'object', properties, required, additionalProperties: false })

export function validate(schema: Schema, value: unknown, path = 'arguments'): void {
  if (schema.enum && !schema.enum.includes(value as string)) throw new Error(`${path}: expected one of ${schema.enum.join(', ')}`)
  switch (schema.type) {
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}: expected object`)
      const fields = value as Record<string, unknown>
      for (const key of schema.required ?? []) if (fields[key] === undefined) throw new Error(`${path}.${key}: required`)
      for (const [key, val] of Object.entries(fields)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) throw new Error(`${path}.${key}: unknown field`)
        validate(schema.properties![key], val, `${path}.${key}`)
      }
      break
    }
    case 'array':
      if (!Array.isArray(value)) throw new Error(`${path}: expected array`)
      if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 100)) throw new Error(`${path}: invalid item count`)
      value.forEach((item, index) => validate(schema.items!, item, `${path}[${index}]`))
      break
    case 'string':
      if (typeof value !== 'string' || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? 100000)) throw new Error(`${path}: invalid string`)
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new Error(`${path}: invalid format`)
      break
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw new Error(`${path}: invalid ${schema.type}`)
      break
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`${path}: expected boolean`)
  }
}
