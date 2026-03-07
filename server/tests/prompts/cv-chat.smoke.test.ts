import { describe, it, expect } from "vitest";
import { ModelService } from "../../src/services/model.service.js";
import { runCvChat } from "../../src/agents/cv-chat.js";
import { runVerifier } from "../../src/agents/verifier.js";

const RUN = process.env["RUN_EVAL"] === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const sampleCv = `
<div class="cv">
  <h1>Jane Smith</h1>
  <section class="experience">
    <h2>Experience</h2>
    <ul>
      <li><strong>Software Engineer</strong> at Acme Corp (2020–2023): Built REST APIs using Node.js and PostgreSQL. Led migration of legacy monolith to microservices architecture.</li>
      <li><strong>Junior Developer</strong> at Startup Ltd (2018–2020): Developed front-end features in React. Collaborated with design team on UI components.</li>
    </ul>
  </section>
  <section class="skills">
    <h2>Skills</h2>
    <p>JavaScript, TypeScript, Node.js, React, PostgreSQL, REST APIs, Git</p>
  </section>
  <section class="education">
    <h2>Education</h2>
    <p>B.Sc. Computer Science, State University (2018)</p>
  </section>
</div>
`.trim();

const sampleHistory = `
Jane Smith has 5 years of experience in software engineering. She worked at Acme Corp building REST APIs with Node.js and PostgreSQL. She led a microservices migration project. Previously at Startup Ltd she built React front-end features. She has no experience with Kubernetes or cloud infrastructure.
`.trim();

const extractTagSequence = (html: string) =>
  [...html.matchAll(/<([a-z][^\s/>]*)/gi)].map((m) => m[1]).join(",");

describeIf(RUN)("cv-chat agent — smoke test", () => {
  it("make it more concise: returns non-empty updatedCvHtml and flaggedClaims array", async () => {
    const modelService = new ModelService();
    const chatResult = await runCvChat(modelService, "Make it more concise", sampleCv, sampleHistory);
    const verifierResult = await runVerifier(modelService, chatResult.updatedCvHtml, sampleHistory);

    expect(typeof verifierResult.verifiedCv).toBe("string");
    expect(verifierResult.verifiedCv.length).toBeGreaterThan(0);
    expect(Array.isArray([...chatResult.flaggedClaims, ...verifierResult.flaggedClaims])).toBe(true);
  });

  it("add Kubernetes as expert skill (not in history): flaggedClaims.length > 0", async () => {
    const modelService = new ModelService();
    const chatResult = await runCvChat(
      modelService,
      "Add Kubernetes as expert skill",
      sampleCv,
      sampleHistory,
    );
    const verifierResult = await runVerifier(modelService, chatResult.updatedCvHtml, sampleHistory);
    const allFlags = [...chatResult.flaggedClaims, ...verifierResult.flaggedClaims];

    expect(allFlags.length).toBeGreaterThan(0);
  });

  it("emphasize the API work: HTML tag sequence is unchanged", async () => {
    const modelService = new ModelService();
    const chatResult = await runCvChat(
      modelService,
      "Emphasize the API work",
      sampleCv,
      sampleHistory,
    );
    const verifierResult = await runVerifier(modelService, chatResult.updatedCvHtml, sampleHistory);

    expect(extractTagSequence(verifierResult.verifiedCv)).toBe(extractTagSequence(sampleCv));
  });
});
