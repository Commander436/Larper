CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  post_type TEXT NOT NULL CHECK (post_type IN ('advice', 'question')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  topics TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  parent_id TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS votes (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (post_id, user_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);

INSERT OR IGNORE INTO posts (id, author_id, author_name, post_type, title, body, topics)
VALUES
  ('seed_welcome_mentor', 'seed', 'Tech for Women', 'advice',
   'How do I choose a first coding project?',
   'Start with a problem you care about and keep the first version small. A useful personal tracker or community resource page teaches HTML, CSS, and JavaScript without becoming overwhelming.',
   '["Web Development","Beginner","JavaScript"]'),
  ('seed_welcome_question', 'seed', 'Community sample', 'question',
   'What should I learn after HTML and CSS?',
   'I am comfortable building static pages and want to understand JavaScript. What project would give me the best practice before moving into a framework?',
   '["JavaScript","Web Development","Career"]'),
  ('seed_welcome_career', 'seed', 'Community sample', 'advice',
   'Prepare for a career conversation',
   'Bring two or three specific questions, share the kind of work you enjoy, and ask for examples of a typical day. Clear goals make mentoring conversations much more useful.',
   '["Career","Mentoring","Planning"]');
