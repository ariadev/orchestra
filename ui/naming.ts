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
        max_tokens: 100,
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
            role: "user",
            content:
              `Write a concise discussion persona for an AI participant. ` +
              `Base it on the discussion topic and the participant's role. ` +
              `Reply with only the persona text, in 2-4 sentences, no markdown.\n\n` +
              `Discussion topic: ${topic.slice(0, 400)}\n` +
              `Agent role: ${role.slice(0, 200)}`,
          },
        ],
        max_tokens: 220,
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
