import { SkillDefinition } from '../types'

export interface StepExecutionResult {
  stepIndex: number
  tool: string
  arguments: Record<string, any>
  result?: any
  error?: string
  status: 'pending' | 'running' | 'success' | 'failed'
}

export function interpolateArguments(
  argsTemplate: Record<string, any>,
  paramValues: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(argsTemplate)) {
    if (typeof value === 'string') {
      // Replace all {{varName}}
      let interpolated = value
      const matches = value.match(/\{\{([^}]+)\}\}/g)
      if (matches) {
        // If the entire string is just {{var}}, preserve the parameter's native type (e.g. number or boolean)
        if (matches.length === 1 && value.trim() === matches[0]) {
          const varName = matches[0].slice(2, -2).trim()
          result[key] = paramValues[varName] !== undefined ? paramValues[varName] : value
          continue
        }
        for (const match of matches) {
          const varName = match.slice(2, -2).trim()
          const val = paramValues[varName] !== undefined ? String(paramValues[varName]) : match
          interpolated = interpolated.replace(match, val)
        }
      }
      result[key] = interpolated
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = interpolateArguments(value, paramValues)
    } else {
      result[key] = value
    }
  }

  return result
}

export async function executeSkill(
  skill: SkillDefinition,
  paramValues: Record<string, any>,
  executeToolFn: (name: string, args: Record<string, any>) => Promise<any>,
  onStepProgress?: (stepResult: StepExecutionResult) => void
): Promise<StepExecutionResult[]> {
  const history: StepExecutionResult[] = []

  for (let i = 0; i < skill.steps.length; i++) {
    const step = skill.steps[i]
    const resolvedArgs = interpolateArguments(step.arguments, paramValues)

    const stepResult: StepExecutionResult = {
      stepIndex: i,
      tool: step.tool,
      arguments: resolvedArgs,
      status: 'running'
    }

    onStepProgress?.(stepResult)

    try {
      const output = await executeToolFn(step.tool, resolvedArgs)
      stepResult.result = output
      stepResult.status = 'success'
      history.push(stepResult)
      onStepProgress?.(stepResult)
    } catch (err: any) {
      stepResult.error = err?.message || String(err)
      stepResult.status = 'failed'
      history.push(stepResult)
      onStepProgress?.(stepResult)
      throw new Error(`Step ${i + 1} (${step.tool}) failed: ${stepResult.error}`)
    }
  }

  return history
}
