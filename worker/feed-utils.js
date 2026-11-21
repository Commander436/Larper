export function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.trunc(number))) : fallback;
}

export function parseTopics(value, limit = 5) {
  if (Array.isArray(value)) {
    return value.map((topic) => String(topic).trim()).filter(Boolean).slice(0, limit);
  }
  return String(value || "").split(",").map((topic) => topic.trim()).filter(Boolean).slice(0, limit);
}

export function safeTopics(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

export function rankPosts(posts, interests, mode) {
  const terms = [...new Set(parseTopics(interests, 12).map((term) => term.toLowerCase()))];
  const ranked = posts.map((post) => {
    const topics = safeTopics(post.topics);
    const haystack = `${post.title} ${post.body} ${topics.join(" ")}`.toLowerCase();
    let matches = 0;
    for (const term of terms) {
      if (topics.some((topic) => topic.toLowerCase() === term)) matches += 3;
      if (haystack.includes(term)) matches += 1;
    }
    const score = Number(post.score) || 0;
    return { post, matches, boost: mode === "following" ? matches * 4 : matches };
  });
  ranked.sort((a, b) =>
    b.matches - a.matches ||
    b.boost - a.boost ||
    (Number(b.post.score) || 0) - (Number(a.post.score) || 0)
  );
  return ranked.map(({ post }) => ({
    ...post,
    topics: safeTopics(post.topics),
  }));
}

export function validatePost(body) {
  if (!body || typeof body !== "object") return "A JSON post body is required.";
  if (body.post_type !== "advice" && body.post_type !== "question") return "Choose mentor advice or mentee question.";
  if (typeof body.title !== "string" || body.title.trim().length < 12 || body.title.trim().length > 140) {
    return "Use a title between 12 and 140 characters.";
  }
  if (typeof body.body !== "string" || body.body.trim().length < 20 || body.body.trim().length > 5000) {
    return "Use post details between 20 and 5000 characters.";
  }
  const topics = parseTopics(body.topics, 5);
  if (topics.some((topic) => topic.length > 40)) return "Each topic must be 40 characters or fewer.";
  return null;
}
