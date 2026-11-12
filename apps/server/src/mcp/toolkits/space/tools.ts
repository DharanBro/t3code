import {
  ModelSelection,
  OrchestratorMcpFailure,
  SpaceId,
  ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ServerConfig from "../../../config.ts";
import * as DocumentText from "../../../provider/DocumentText.ts";
import * as ThreadLaunchService from "../../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as ProviderRegistry from "../../../provider/ProviderRegistry.ts";
import * as SpaceService from "../../../spaces/SpaceService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const SpaceSpawnAgentTool = Tool.make("t3_space_spawn_agent", {
  description:
    "Open another agent as a new tab in your space, working in your folder, for parallel work the user follows and talks to directly. For a subtask whose result you need back, use `delegate_task`. Works only from a thread in a space; otherwise use `t3_thread_launch`.",
  parameters: Schema.Struct({
    title: TrimmedNonEmptyString,
    message: Schema.String.check(Schema.isMaxLength(120000)).annotate({
      description: "The new agent's first prompt.",
    }),
    modelSelection: Schema.optional(ModelSelection).annotate({
      description: "Omit to use your model.",
    }),
    ownWorktree: Schema.optional(Schema.Boolean).annotate({
      description: "A new worktree from your branch instead of your folder.",
    }),
  }),
  success: Schema.Struct({
    threadId: ThreadId,
    link: Schema.optional(Schema.String),
    spaceId: SpaceId,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ThreadLaunchService.ThreadLaunchService,
    SpaceService.SpaceService,
    ProviderRegistry.ProviderRegistry,
    SecureRandom.SecureRandom,
    FileSystem.FileSystem,
    ServerConfig.ServerConfig,
    DocumentText.DocumentText,
  ],
})
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);

export const SpaceToolkit = Toolkit.make(SpaceSpawnAgentTool);
