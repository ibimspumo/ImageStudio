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


## Dedicated image processing
Upscale uses Topaz Precision or the fixed-4× Topaz Transparent endpoint; background removal uses BRIA RMBG 2.0. Keep the canonical options/validation/pricing in `src/shared/image-processing.ts`. UI and MCP must call the same preparation and existing generation job lifecycle. Never restore the prompt-based upscale or resize/compress its original upload. Detect actual source alpha, preserve original media and organization/source links, and retain provider bytes without lossy post-processing even with anti-detection enabled. PNG is default; transparent output requires PNG, while Precision also offers explicit JPEG. Do not add app-owned pixel/4K/prior-pass limits. Use native inspection, streamed storage and separate previews so large results can be processed again from the full original. Read actual result dimensions; BRIA's documented resolution wording does not establish unlimited full-size output. Include provider contract tests and the disposable UI/MCP processing checks when changing these actions.

Sidebar folder and project entries offer a labelled trash button with inline confirmation and cancellation. Deleting keeps all media in the respective overview (All media / All thumbnails), preserves the other independent grouping, and uses the same organization actions as the management page and MCP.


## GPT Image 2.5 generation
Sunburst is the default for all image modes for its provider-described intricate-detail focus, with longer generation times. Flare remains selectable. Both publish the same price estimates; never invent a Sunburst surcharge. Default quality is high; expose all six qualities (auto/low/medium/high/xhigh/max), background (auto/transparent/opaque), PNG/JPEG/WebP and outputCompression 0–100 for JPEG/WebP only. No seed or inputFidelity. Limits: 16 references, 10 outputs and 32,000 composed prompt characters. Logo mode locks transparent PNG but supports ratios, resolutions and custom dimensions.

Keep pixel preparation shared between custom UI controls and MCP: round positive requested width/height upward to multiples of 16, then validate max edge 3840, longest/shortest ratio ≤3:1 and area 655,360–8,294,400. Show normalized effective pixels and return actionable size errors. Exact A4 preset: 2240×3168. GPT thumbnails lock 1920×1088 and export 1920×1080. High 1024² lists $0.05268; fal's $0.03960 high 1920×1080 row is only an approximate estimate for rounded 1920×1088. Provider billing remains separate. Enabled JPEG post-processing can change opaque output format/compression; preserve transparency and report actual stored MIME.

Retire GPT Image 2/1.5 generation choices and migrate saved defaults/aliases without rewriting historical media model IDs or deleting legacy histories. Include provider-contract tests and disposable UI/MCP parity checks for affected model discovery, defaults, custom dimensions, output settings and generation state. Verify against [fal Flare](https://fal.ai/models/openai/gpt-image-2.5/flare/text-to-image), [Sunburst](https://fal.ai/models/openai/gpt-image-2.5/sunburst/text-to-image) and their linked OpenAPI schemas (checked 2026-09-09); generic ImageSize limits do not supersede model-specific constraints. Do not run paid generations merely to validate wiring.

## Sunburst default migration (v1.3.3)
GPT Image 2.5 Sunburst is the default for images, logos and thumbnails, including UI and MCP. On first launch after this update, every existing profile switches its saved image default to Sunburst, even if it previously selected Nano Banana or Flare. `shared/settings-migrations.ts` and the persisted internal `imageDefaultsRevision` marker make this a one-time migration; later explicit user selections survive restarts. Quality stays High; video defaults and existing media remain unchanged.
