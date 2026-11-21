/*
 * Topic tree for "What do you teach?".
 * Starts broad (category) and gets more specific (area -> skill).
 * A node with no `children` is selectable. Edit freely to add topics.
 */
window.TOPIC_TREE = [
  {
    name: "Coding & Software",
    children: [
      { name: "Python", children: [
        { name: "Python basics" }, { name: "Automating tasks with Python" }, { name: "Python for data" } ] },
      { name: "JavaScript", children: [
        { name: "JavaScript basics" }, { name: "React" }, { name: "Node.js" } ] },
      { name: "Java & C#", children: [
        { name: "Java basics" }, { name: "C# basics" }, { name: "AP Computer Science A" } ] },
      { name: "Scratch & block coding", children: [
        { name: "Scratch for kids" }, { name: "Intro to computational thinking" } ] },
      { name: "Software engineering habits", children: [
        { name: "Git & GitHub" }, { name: "Debugging" }, { name: "Writing clean code" } ] },
    ],
  },
  {
    name: "Web & App Design",
    children: [
      { name: "Web development", children: [
        { name: "HTML & CSS" }, { name: "Responsive design" }, { name: "Building a portfolio site" } ] },
      { name: "App development", children: [
        { name: "Mobile apps (iOS/Android)" }, { name: "No-code app builders" } ] },
      { name: "UX & UI design", children: [
        { name: "Figma" }, { name: "User research" }, { name: "Design fundamentals" } ] },
    ],
  },
  {
    name: "Data & AI",
    children: [
      { name: "Data skills", children: [
        { name: "Excel & Google Sheets" }, { name: "SQL" }, { name: "Data visualization" } ] },
      { name: "Artificial intelligence", children: [
        { name: "Intro to AI" }, { name: "Using AI tools responsibly" }, { name: "Machine learning basics" } ] },
    ],
  },
  {
    name: "Cybersecurity & IT",
    children: [
      { name: "Staying safe online", children: [
        { name: "Passwords & scams" }, { name: "Privacy for teens" } ] },
      { name: "IT fundamentals", children: [
        { name: "Computer hardware basics" }, { name: "Networking basics" }, { name: "CompTIA A+ prep" } ] },
    ],
  },
  {
    name: "Electronics & Robotics",
    children: [
      { name: "Robotics", children: [
        { name: "LEGO robotics" }, { name: "Arduino" }, { name: "Raspberry Pi" } ] },
      { name: "Game development", children: [
        { name: "Roblox Studio" }, { name: "Unity" }, { name: "Game design basics" } ] },
    ],
  },
  {
    name: "Careers & Digital Skills",
    children: [
      { name: "Career coaching", children: [
        { name: "Resumes & LinkedIn" }, { name: "Interview practice" }, { name: "Breaking into tech" } ] },
      { name: "Everyday digital skills", children: [
        { name: "Computer basics" }, { name: "Email & online accounts" }, { name: "Google Workspace / Microsoft Office" } ] },
      { name: "Mentoring", children: [
        { name: "College & scholarship guidance" }, { name: "Internship search help" } ] },
    ],
  },
];
