import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { LLMConfig, SkillDefinition } from '../renderer/src/types'

interface StoreData {
  settings: LLMConfig
  skills: SkillDefinition[]
}

const defaultSettings: LLMConfig = {
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'llama3:latest',
  temperature: 0.2,
  autoApproveReadOnly: true,
  homeUrl: 'https://www.google.com',
  enableMcpServer: true,
  mcpServerPort: 3939
}

export class JsonStore {
  private filePath: string
  private data: StoreData

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'webmcp-deck-store.json')
    this.data = this.loadData()
  }

  private loadData(): StoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        // Clean out legacy demo skills
        const rawSkills = parsed.skills || []
        const cleanedSkills = rawSkills.filter(
          (s: any) =>
            s.id !== 'skill_hotel_reserve_check' &&
            !s.name?.includes('ホテル') &&
            s.targetOrigin !== 'http://localhost'
        )

        const data: StoreData = {
          settings: { ...defaultSettings, ...(parsed.settings || {}) },
          skills: cleanedSkills
        }

        // If legacy skills were removed, save immediately
        if (cleanedSkills.length !== rawSkills.length) {
          try {
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
          } catch {}
        }

        return data
      }
    } catch (e) {
      console.error('Failed to load store data:', e)
    }

    return {
      settings: defaultSettings,
      skills: this.getDefaultSkills()
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save store data:', e)
    }
  }

  public getSettings(): LLMConfig {
    return this.data.settings
  }

  public saveSettings(settings: Partial<LLMConfig>): LLMConfig {
    this.data.settings = { ...this.data.settings, ...settings }
    this.save()
    return this.data.settings
  }

  public getSkills(): SkillDefinition[] {
    return this.data.skills
  }

  public saveSkill(skill: SkillDefinition): SkillDefinition[] {
    const idx = this.data.skills.findIndex(s => s.id === skill.id)
    if (idx >= 0) {
      this.data.skills[idx] = skill
    } else {
      this.data.skills.unshift(skill)
    }
    this.save()
    return this.data.skills
  }

  public deleteSkill(id: string): SkillDefinition[] {
    this.data.skills = this.data.skills.filter(s => s.id !== id)
    this.save()
    return this.data.skills
  }

  private getDefaultSkills(): SkillDefinition[] {
    return []
  }
}
