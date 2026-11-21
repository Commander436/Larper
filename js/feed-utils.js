export function hasFeedProfile(profile, session) {
  return session?.preview === true &&
    profile?.complete === true &&
    (profile.role === "mentor" || profile.role === "mentee");
}

export function filterMentorPublications(posts) {
  return Array.isArray(posts)
    ? posts.filter((post) => post && post.post_type === "advice")
    : [];
}
