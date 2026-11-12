import {
  MessageId,
  OrchestratorMcpFailure,
  ThreadId,
  type OrchestrationV2ThreadLaunchWorkspaceStrategy,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as ThreadLaunch from "../../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadMessageIntake from "../../../orchestration-v2/ThreadMessageIntake.ts";
import * as ProviderRegistry from "../../../provider/ProviderRegistry.ts";
import * as SpaceService from "../../../spaces/SpaceService.ts";
import { resolveRuntimeMode } from "../../delegatedTaskModes.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as OrchestrationMcp from "../../OrchestratorMcpService.ts";
import { newCommandId, readCaller, unavailable } from "../../threadAccess.ts";
import { SpaceToolkit } from "./tools.ts";

const invalid = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

export const layer = McpToolAccess.toLayer(SpaceToolkit, {
  t3_space_spawn_agent: McpToolAccess.startsThreads(
    // No mode parameters: the new tab inherits the caller's modes.
    () => ({}),
    (input, { runtimeMode, interactionMode, linkOrigin }) =>
      Effect.gen(function* () {
        const scope = yield* McpInvocationContext.McpInvocationContext;
        const { caller } = yield* readCaller();
        if (caller === undefined)
          return yield* invalid("Only an agent in a thread can open a tab. Use t3_thread_launch.");
        const spaces = yield* SpaceService.SpaceService;
        const { spaces: list } = yield* spaces.list().pipe(Effect.mapError(unavailable));
        const space = list.find((candidate) => candidate.threadIds.includes(caller.id));
        if (space === undefined)
          return yield* invalid(
            "This thread is not in a space. Use t3_thread_launch for a separate thread.",
          );

        const providers = yield* (yield* ProviderRegistry.ProviderRegistry).getProviders;
        const requested = input.modelSelection;
        if (requested !== undefined) {
          const provider = providers.find(
            (candidate) => candidate.instanceId === requested.instanceId,
          );
          if (provider !== undefined)
            yield* OrchestrationMcp.requireAdvertisedModel(provider, requested.model);
        }
        const modelSelection = requested ?? caller.modelSelection;
        const startedRuntimeMode = yield* resolveRuntimeMode(runtimeMode, undefined, {
          modelSelection,
          supportedRuntimeModes: providers.find(
            (provider) => provider.instanceId === modelSelection.instanceId,
          )?.supportedRuntimeModes,
        });

        let workspaceStrategy: OrchestrationV2ThreadLaunchWorkspaceStrategy =
          caller.worktreePath === null
            ? { type: "root" }
            : { type: "existing_worktree", worktreePath: caller.worktreePath };
        if (input.ownWorktree === true) {
          if (caller.branch === null)
            return yield* invalid("Your thread has no branch to start a worktree from.");
          const strategy = {
            type: "worktree",
            baseRef: caller.branch,
            startFromOrigin: false,
          } as const;
          // Provisioning runs after the launch is accepted, so reject a bad base now.
          yield* ThreadLaunch.ThreadLaunchService.pipe(
            Effect.flatMap((launches) =>
              launches.checkWorktreeBase({
                projectId: caller.projectId,
                workspaceStrategy: strategy,
              }),
            ),
            Effect.mapError((error) => invalid(`${error.message} No tab was opened.`)),
          );
          workspaceStrategy = strategy;
        }

        const commandId = yield* newCommandId();
        const threadId = ThreadId.make(commandId);
        // Join first so the tab shows as soon as the thread exists.
        yield* spaces.setThread({ threadId, spaceId: space.id }).pipe(Effect.mapError(unavailable));
        yield* ThreadMessageIntake.launchThread({
          commandId,
          threadId,
          projectId: caller.projectId,
          title: input.title,
          modelSelection,
          runtimeMode: startedRuntimeMode,
          interactionMode,
          workspaceStrategy,
          initialMessage: {
            messageId: MessageId.make(commandId),
            senderThreadId: caller.id,
            text: input.message,
            attachments: [],
          },
          createdBy: "agent",
          creationSource: "mcp",
          ...(linkOrigin === undefined ? {} : { linkOrigin }),
        }).pipe(
          Effect.mapError((error) =>
            error._tag === "ThreadManagementProviderInstanceDisabledError"
              ? invalid(error.message)
              : unavailable(),
          ),
          Effect.tapError(() => spaces.setThread({ threadId, spaceId: null }).pipe(Effect.ignore)),
        );
        return {
          threadId,
          link: McpInvocationContext.threadLinkFor(scope, threadId, input.title),
          spaceId: space.id,
        };
      }),
    // The new tab carries the caller's link, if it has one.
    "stamped",
  ),
});
