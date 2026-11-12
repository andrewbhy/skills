# ADR 0001: One source for the harness across Codex and Claude

Status: accepted by the user, 7 Nov 2026.

## Decision

Every harness skill and plugin has one source, and everything provider-specific is generated from it or isolated in a marked place. An automatic check fails if they drift.

## Why

The harness must work with both Codex and Claude. Two hand-maintained copies will drift, and a rule nobody checks does not hold: a design guide once required wide-screen comparison, and a fixed maximum width still shipped.

## Rules

1. **One source.** Skill text lives only in `.agents/skills/<name>/SKILL.md`.
2. **Generated pointers.** `.claude/skills/<name>/SKILL.md` is a generated pointer. Never edit it by hand.
3. **Generated manifests.** Claude and Codex plugin manifests are generated from one description of the name, version, skills and commands.
4. **Shared logic.** Logic lives in shared scripts that both providers call, not in provider-specific text.
5. **Marked differences.** Provider differences go only in a `## Provider notes` section of the skill. All other text is neutral.
6. **One version.** The harness has one version number. Projects pin it, and each run records it.
7. **Fast check.** A check in the test suite fails if a pointer is missing or edited, generated files differ from their source, versions differ, frontmatter is invalid, or provider-specific tools or commands appear outside Provider notes.
8. **Behaviour tests.** A small set of fixed scenarios runs on both providers when a skill changes, and after a provider update changes how skills load. Compare whether the skill triggered, the outcome and the tokens used.
9. **Required steps stay outside skills.** An agent can skip a skill, so anything that must happen is a check launched by whatever runs the work.
10. **Namespaced.** General skills use a prefix such as `jig-plan`, so they never collide with a project's or company's skills. Domain skills live in their project and are not bound by this record.

## Consequences

- A new skill needs its generated files and scenarios before it counts as done.
- Parity means both providers meet the bar, not that their output is identical.
- A provider that cannot do something says what falls back, in Provider notes.
- Behaviour tests spend real tokens, so they run on skill changes, not on every commit.

## Not yet proven

The generator, the check and the behaviour tests do not exist yet. The Codex and Claude plugin formats differ, so rule 3 may need adjusting once they are built. Change this record if it does.
