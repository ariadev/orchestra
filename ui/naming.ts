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

function fallback(topic: string): string {
  return topic.split(/\s+/).slice(0, 5).join(" ")
}
