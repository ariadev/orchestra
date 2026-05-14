export interface SuggestedAgent {
  name: string
  role: string
  persona: string
}

export async function suggestAgents(topic: string): Promise<SuggestedAgent[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set")

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-nano",
      messages: [
        {
          role: "system",
          content:
            `You design focused AI agent teams for structured discussions. Given a topic, suggest 3–5 agents ` +
            `whose perspectives create productive tension and cover the most important angles. ` +
            `For each agent: choose a realistic Iranian first name (in EN), a concise job title, and write a 2–4 sentence persona ` +
            `in second person as behavioral instructions covering domain lens, tradeoffs to emphasize, and how to ` +
            `engage with other agents when agreeing or pushing back.`,
        },
        {
          role: "user",
          content: `Discussion topic: ${topic.slice(0, 400)}`,
        },
      ],
      temperature: 0.7,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "agent_suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: {
              agents: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    role: { type: "string" },
                    persona: { type: "string" },
                  },
                  required: ["name", "role", "persona"],
                  additionalProperties: false,
                },
              },
            },
            required: ["agents"],
            additionalProperties: false,
          },
        },
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`API ${res.status}: ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error("empty response content")

  const parsed = JSON.parse(content) as { agents?: SuggestedAgent[] }
  return (parsed.agents ?? []).filter(a => a.name && a.role && a.persona).slice(0, 5)
}

function suggestAgentsFallback(): SuggestedAgent[] {
  return []
}

export async function generateSessionName(topic: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallback(topic)

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-nano",
        messages: [
          {
            role: "user",
            content:
              `Create a short memorable title for a discussion session ` +
              `about the following topic. Reply with only the title — no quotes, ` +
              `no trailing punctuation.\n\nTopic: ${topic.slice(0, 300)}`,
          },
        ],
        temperature: 0.7,
      }),
    })

    if (!res.ok) return fallback(topic)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const name = data.choices?.[0]?.message?.content?.trim()
    return name || fallback(topic)
  } catch {
    return fallback(topic)
  }
}

export async function generateAgentPersona(topic: string, role: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return personaFallback(topic, role)

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-nano",
        messages: [
          {
            role: "system",
            content:
              `You write high-signal personas for AI participants in structured deliberations. ` +
              `Write personas that sound like real expert stances, not generic assistant copy. ` +
              `Each persona must encode the participant's domain lens, priorities, decision criteria, ` +
              `likely tensions, and contribution style. ` +
              `Favor specificity and concrete reasoning. Avoid platitudes, self-reference, vague optimism, ` +
              `and empty claims about collaboration. ` +
              `The persona should push the agent to ground claims in its role's expertise, surface tradeoffs, ` +
              `and respectfully challenge weak reasoning instead of repeating others. ` +
              `Write in English, in second person, as direct behavioral instructions. ` +
              `Return only the persona text as a single compact paragraph of 3-5 sentences, with no markdown or labels.`,
          },
          {
            role: "user",
            content:
              `Create the persona for this participant. Make it clearly useful for the actual discussion, ` +
              `including what this role should pay attention to, what kinds of tradeoffs it should emphasize, ` +
              `and how it should engage with other participants when it agrees or disagrees.\n\n` +
              `Discussion topic: ${topic.slice(0, 400)}\n` +
              `Agent role: ${role.slice(0, 200)}`,
          },
        ],
        temperature: 0.7,
      }),
    })

    if (!res.ok) return personaFallback(topic, role)
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const persona = data.choices?.[0]?.message?.content?.trim()
    return persona || personaFallback(topic, role)
  } catch {
    return personaFallback(topic, role)
  }
}

function fallback(topic: string): string {
  return topic.split(/\s+/).slice(0, 5).join(" ")
}

function personaFallback(topic: string, role: string): string {
  const cleanRole = role.trim() || "specialist"
  const cleanTopic = topic.trim() || "the discussion"
  return `Approach ${cleanTopic} as a ${cleanRole} who balances domain expertise with practical tradeoffs. Contribute clear judgments, surface meaningful risks, and keep recommendations grounded in real-world constraints.`
}
