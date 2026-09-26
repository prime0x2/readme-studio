import type { SectionTemplate } from "./types";

/**
 * Section template library. The core set is ported from readme.so
 * (MIT License, (c) Katherine Oelsner — https://github.com/octokatherine/readme.so)
 * with modernized wording, plus ReadmeStudio originals (Docker, Monorepo
 * Layout, Configuration Reference, Self-Hosting, Security Policy).
 */
export const sectionTemplates: SectionTemplate[] = [
  {
    slug: "title-and-description",
    name: "Title and Description",
    markdown: `# Project Title

A brief description of what this project does and who it's for.
`,
  },
  {
    slug: "badges",
    name: "Badges",
    markdown: `## Badges

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
`,
  },
  {
    slug: "demo",
    name: "Demo",
    markdown: `## Demo

Insert a gif or a link to your demo here.

![Demo](https://via.placeholder.com/600x300?text=Demo)
`,
  },
  {
    slug: "screenshots",
    name: "Screenshots",
    markdown: `## Screenshots

![App Screenshot](https://via.placeholder.com/600x300?text=Screenshot)
`,
  },
  {
    slug: "features",
    name: "Features",
    markdown: `## Features

- Light/dark mode toggle
- Live previews
- Fullscreen mode
- Cross platform
`,
  },
  {
    slug: "tech-stack",
    name: "Tech Stack",
    markdown: `## Tech Stack

**Client:** React, Zustand, TailwindCSS

**Server:** Node, Express
`,
  },
  {
    slug: "installation",
    name: "Installation",
    markdown: `## Installation

Install my-project with npm:

\`\`\`bash
npm install my-project
cd my-project
\`\`\`
`,
  },
  {
    slug: "run-locally",
    name: "Run Locally",
    markdown: `## Run Locally

Clone the project:

\`\`\`bash
git clone https://github.com/username/my-project
\`\`\`

Go to the project directory:

\`\`\`bash
cd my-project
\`\`\`

Install dependencies:

\`\`\`bash
npm install
\`\`\`

Start the server:

\`\`\`bash
npm run dev
\`\`\`
`,
  },
  {
    slug: "usage-examples",
    name: "Usage / Examples",
    markdown: `## Usage / Examples

\`\`\`javascript
import Component from "my-project";

function App() {
  return <Component />;
}
\`\`\`
`,
  },
  {
    slug: "api-reference",
    name: "API Reference",
    markdown: `## API Reference

#### Get all items

\`\`\`http
GET /api/items
\`\`\`

| Parameter | Type     | Description                |
| :-------- | :------- | :------------------------- |
| \`api_key\` | \`string\` | **Required**. Your API key |

#### Get item

\`\`\`http
GET /api/items/\${id}
\`\`\`

| Parameter | Type     | Description                       |
| :-------- | :------- | :-------------------------------- |
| \`id\`      | \`string\` | **Required**. Id of item to fetch |
`,
  },
  {
    slug: "environment-variables",
    name: "Environment Variables",
    markdown: `## Environment Variables

To run this project, you will need to add the following environment variables to your \`.env\` file:

\`API_KEY\`

\`ANOTHER_API_KEY\`
`,
  },
  {
    slug: "configuration-reference",
    name: "Configuration Reference",
    markdown: `## Configuration Reference

All configuration is read from environment variables (see \`.env.example\`):

| Variable       | Default     | Description                                  |
| :------------- | :---------- | :------------------------------------------- |
| \`PORT\`         | \`8080\`      | Port the server listens on                   |
| \`DATABASE_URL\` | —           | **Required.** Connection string              |
| \`LOG_LEVEL\`    | \`info\`      | One of \`debug\`, \`info\`, \`warn\`, \`error\` |
`,
  },
  {
    slug: "running-tests",
    name: "Running Tests",
    markdown: `## Running Tests

To run tests, run the following command:

\`\`\`bash
npm run test
\`\`\`
`,
  },
  {
    slug: "deployment",
    name: "Deployment",
    markdown: `## Deployment

To deploy this project run:

\`\`\`bash
npm run deploy
\`\`\`
`,
  },
  {
    slug: "docker",
    name: "Docker",
    markdown: `## Docker

Build the image:

\`\`\`bash
docker build -t my-project .
\`\`\`

Run the container:

\`\`\`bash
docker run -p 8080:8080 --env-file .env my-project
\`\`\`

Or with Docker Compose:

\`\`\`bash
docker compose up -d
\`\`\`
`,
  },
  {
    slug: "self-hosting",
    name: "Self-Hosting",
    markdown: `## Self-Hosting

Requirements:

- A server with Node.js 20+ (or Docker)
- A domain pointed at your server

1. Clone the repository and install dependencies
2. Copy \`.env.example\` to \`.env\` and fill in your values
3. Build and start: \`npm run build && npm start\`
4. Put a reverse proxy (nginx/Caddy) in front for TLS
`,
  },
  {
    slug: "monorepo-layout",
    name: "Monorepo Layout",
    markdown: `## Monorepo Layout

\`\`\`text
.
├── apps/
│   ├── web/        # frontend application
│   └── api/        # backend service
├── packages/
│   └── shared/     # shared types and utilities
└── package.json    # workspace root
\`\`\`

Each package is independently buildable; shared code lives in \`packages/\`.
`,
  },
  {
    slug: "documentation",
    name: "Documentation",
    markdown: `## Documentation

[Documentation](https://linktodocumentation)
`,
  },
  {
    slug: "roadmap",
    name: "Roadmap",
    markdown: `## Roadmap

- [x] Initial release
- [ ] Additional browser support
- [ ] Add more integrations
`,
  },
  {
    slug: "faq",
    name: "FAQ",
    markdown: `## FAQ

#### Question 1

Answer 1

#### Question 2

Answer 2
`,
  },
  {
    slug: "contributing",
    name: "Contributing",
    markdown: `## Contributing

Contributions are always welcome!

See \`contributing.md\` for ways to get started.

Please adhere to this project's \`code of conduct\`.
`,
  },
  {
    slug: "security-policy",
    name: "Security Policy",
    markdown: `## Security Policy

If you discover a security vulnerability, please **do not** open a public issue.
Email security@example.com instead — we aim to respond within 48 hours.

Supported versions:

| Version | Supported |
| :------ | :-------- |
| 1.x     | ✅        |
| < 1.0   | ❌        |
`,
  },
  {
    slug: "authors",
    name: "Authors",
    markdown: `## Authors

- [@username](https://www.github.com/username)
`,
  },
  {
    slug: "acknowledgements",
    name: "Acknowledgements",
    markdown: `## Acknowledgements

- [Awesome Readme Templates](https://awesomeopensource.com/project/elangosundar/awesome-README-templates)
- [Awesome README](https://github.com/matiassingers/awesome-readme)
- [How to write a Good readme](https://bulldogjob.com/news/449-how-to-write-a-good-readme-for-your-github-project)
`,
  },
  {
    slug: "license",
    name: "License",
    markdown: `## License

[MIT](https://choosealicense.com/licenses/mit/)
`,
  },
  {
    slug: "support",
    name: "Support",
    markdown: `## Support

For support, email support@example.com or join our community channel.
`,
  },
  {
    slug: "feedback",
    name: "Feedback",
    markdown: `## Feedback

If you have any feedback, please reach out to us at feedback@example.com.
`,
  },
  {
    slug: "related",
    name: "Related",
    markdown: `## Related

Here are some related projects:

- [Awesome README](https://github.com/matiassingers/awesome-readme)
`,
  },
  {
    slug: "used-by",
    name: "Used By",
    markdown: `## Used By

This project is used by the following companies:

- Company 1
- Company 2
`,
  },
  {
    slug: "lessons-learned",
    name: "Lessons Learned",
    markdown: `## Lessons Learned

What did you learn while building this project? What challenges did you face and how did you overcome them?
`,
  },
  {
    slug: "optimizations",
    name: "Optimizations",
    markdown: `## Optimizations

What optimizations did you make in your code? E.g. refactors, performance improvements, accessibility.
`,
  },
  {
    slug: "appendix",
    name: "Appendix",
    markdown: `## Appendix

Any additional information goes here.
`,
  },
];

export const DEFAULT_SECTION_SLUG = "title-and-description";

export function getTemplate(slug: string): SectionTemplate | undefined {
  return sectionTemplates.find((t) => t.slug === slug);
}
