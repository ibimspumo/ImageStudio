# ImageStudio development instructions

## Required: complete UI and MCP feature parity

ImageStudio has two equal interfaces: the human-facing app and the local AI/MCP connection. Every feature must work through both interfaces with **100% functional parity**. This requirement applies to new features, changes, fixes, defaults, validation, supported models, pricing, status, media formats, and removal or deprecation of existing features.

- Implement domain behavior once in shared services, actions, registries or hooks. Both UI and MCP must call that implementation. Do not create a separate agent-only generation, persistence, pricing or prompt pipeline.
- A feature is incomplete until both interfaces can discover it, execute it, read its result, and handle its errors. Update the corresponding MCP tool schema and description whenever UI capabilities change, and update the UI whenever MCP capabilities change.
- Use the running application's live state. Agent operations must appear immediately in the same gallery, jobs, projects, folders/workspaces, collections, presets, settings and canvas the user sees. Human changes must immediately be readable by agents. Persist both through the same storage path.
- Expose all supported models and their actual options, constraints, aspect ratios, resolutions, reference limits, formats, pricing and defaults from the canonical registries. Expose the actual composed logo/thumbnail prompts, including custom meta-prompts, styles and reference rules. Never maintain a manually copied capability list.
- Cover the entire media lifecycle: import images/videos from files and supported URLs; use them as references; edit and generate; inspect metadata and previews; retrieve and export completed media. Return MIME types and usable paths/links or MCP image/resource content so compatible tools can display results in chat. Be explicit when a client cannot render a format.
- Keep inline reference context identical: explain how to attach media and place its exact `promptReference` in the relevant prompt sentence. Use shared markers/labels for collections and individual images, including imports and earlier results. For media with dedicated roles (such as video start frames), expose the actual supported roles and prompting rules rather than inventing unsupported mention syntax or inputs.
- Describe tools for an agent unfamiliar with the app: explain scope, required IDs, valid options, defaults, side effects, paid actions, result structure and recovery from errors. Return actionable validation failures. Do not require agents to infer hidden UI state or undocumented sequences.
- Return job IDs immediately for long operations. Expose progress, completion, errors, elapsed time, historical duration estimates and costs with units and provenance. Never present a list-price estimate as the provider's actual bill or an estimated duration as a guarantee.
- Keep credentials out of ordinary discovery, status, logs and result payloads. Explicit credential retrieval is a separate, clearly described operation. The local MCP connection requires its own revocable token and only binds to loopback.
- Treat parity verification as part of completion: check affected behavior through UI and MCP against the same state. Test shared business logic and meaningful transport/validation cases; avoid redundant tests. A passing build alone does not establish parity.
- Document any discovered parity gap explicitly and resolve it as part of the affected feature; never silently claim complete coverage while shipping a one-sided feature.

## Documentation and checks

Keep `README.md`, `CLAUDE.md` and this file current when behavior or architecture changes. `CLAUDE.md` contains the architecture and model-specific implementation guidance. Use `npm run build` and the relevant TypeScript and automation tests for changed functionality. Do not run paid provider requests just to validate wiring unless the user has asked for those generations.

## Retired features and redesigned navigation

Chat and Inpaint are retired in both UI and MCP. Do not expose their former tools, draft modes, mask inputs or navigation actions. Preserve existing media, legacy history files/migrations and source-link metadata; removing a feature is not permission to delete user data. Variants use the shared normal image composer and require an explicit generation action after preparation.

The sidebar is the primary navigation for creation modes, library, references, styles, projects, activity and settings. Keep agent navigation and the live `get_status.view.section` synchronized with it. Use shared variant preparation, organization deletion, cost totals and reference hydration across both interfaces. `npm run test:automation:app` checks real Electron/MCP parity with a disposable profile and mocked providers; screenshots from older layouts are not current verification.

## Navigation and cost provenance
Sidebar mode entries and MCP mode navigation open all results for that mode; folder/project selection is separate. Breadcrumb ancestors must remain actionable outside the native drag region. Thumbnail/library overviews must not inherit hidden workspace filters. Preserve unsaved settings drafts across navigation.

Use the shared billing reconciliation service for UI and MCP. Only matching fal.ai Billing Events may become provider-reported costs. Keep original estimates and missing/denied/pending states explicit. Billing needs an Admin key; the optional separate billing credential must never leak through ordinary settings, status or logs. Retained-gallery totals are not a provider account ledger. Include the disposable UI surface suite when affected navigation or management controls change.
