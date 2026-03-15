const KNOWN_SKILLS: string[] = [
  // Languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++', 'C#',
  'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Perl', 'R', 'Dart', 'Elixir',
  'Haskell', 'Lua', 'SQL',
  // Frontend
  'React', 'Angular', 'Vue', 'Svelte', 'Next.js', 'Nuxt', 'Remix',
  'HTML', 'CSS', 'Tailwind', 'Sass', 'Redux', 'MobX', 'Zustand',
  // Backend / Runtime
  'Node.js', 'Deno', 'Bun', 'Express', 'Fastify', 'NestJS',
  'Django', 'Flask', 'FastAPI', 'Spring', 'Rails',
  '.NET', 'ASP.NET', 'Laravel',
  // Data & Databases
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'DynamoDB',
  'Cassandra', 'Elasticsearch', 'Neo4j', 'Supabase', 'Firebase',
  // Cloud & Infra
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
  'Ansible', 'Pulumi', 'Cloudflare', 'Vercel', 'Netlify',
  // DevOps & Tools
  'CI/CD', 'Git', 'GitHub Actions', 'Jenkins', 'CircleCI',
  'Linux', 'Nginx', 'Prometheus', 'Grafana', 'Datadog',
  // APIs & Messaging
  'REST', 'GraphQL', 'gRPC', 'WebSocket',
  'Kafka', 'RabbitMQ', 'NATS', 'SQS',
  // AI / ML
  'LangChain', 'LangGraph', 'OpenAI', 'TensorFlow', 'PyTorch',
  'Hugging Face', 'Scikit-learn', 'Pandas', 'NumPy',
  // Methodologies
  'Agile', 'Scrum', 'Kanban',
  // Testing
  'Jest', 'Vitest', 'Cypress', 'Playwright', 'Selenium',
  // Other
  'Figma', 'Storybook', 'Webpack', 'Vite', 'Babel',
];

const MAX_SKILLS = 30;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSkillRegex(skill: string): RegExp {
  const escaped = escapeRegex(skill);
  const hasNonWordStart = /^\W/.test(skill);
  const hasNonWordEnd = /\W$/.test(skill);
  const start = hasNonWordStart ? '(?<=\\s|^|[,;(])' : '\\b';
  const end = hasNonWordEnd ? '(?=\\s|$|[,;).])' : '\\b';
  return new RegExp(start + escaped + end, 'i');
}

export function extractSkills(text: string): string[] {
  if (!text) return [];

  const matched: string[] = [];

  for (const skill of KNOWN_SKILLS) {
    if (matched.length >= MAX_SKILLS) break;

    if (buildSkillRegex(skill).test(text)) {
      matched.push(skill);
    }
  }

  return matched;
}
