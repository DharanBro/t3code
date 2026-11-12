import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../../../config.ts";
import * as ThreadLaunch from "../../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as SqlitePersistence from "../../../persistence/Sqlite.ts";
import * as DocumentText from "../../../provider/DocumentText.ts";
import * as ProviderRegistry from "../../../provider/ProviderRegistry.ts";
import * as SpaceService from "../../../spaces/SpaceService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as SpaceHandlers from "./handlers.ts";
import { SpaceToolkit } from "./tools.ts";

const callerId = ThreadId.make("thread:caller");
const projectId = ProjectId.make("project:app");
const worktreePath = "/projects/app/.worktrees/checkout";
const modelSelection = {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  model: "claude-haiku",
};

const layerFor = (input: {
  readonly launched: Array<ThreadLaunch.ThreadLaunchInput>;
  readonly launchFails?: true;
}) => {
  const dependencies = Layer.mergeAll(
    Layer.succeed(McpInvocationContext.McpInvocationContext, {
      environmentId: EnvironmentId.make("environment"),
      requestNamespace: "thread:caller",
      thread: {
        threadId: callerId,
        providerSessionId: "session",
        providerInstanceId: modelSelection.instanceId,
      },
      client: undefined,
      issuedAt: 0,
      capabilities: new Set(["orchestration" as const]),
    }),
    Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: (threadId) =>
        Effect.succeed(
          threadId === callerId
            ? ({
                id: callerId,
                projectId,
                modelSelection,
                branch: "feat/checkout",
                worktreePath,
                runtimeMode: "full-access",
                interactionMode: "default",
                providerInstanceId: modelSelection.instanceId,
                activeRunId: "run:caller",
                archivedAt: null,
                deletedAt: null,
              } as unknown as OrchestrationV2ThreadShell)
            : null,
        ),
    }),
    Layer.mock(ThreadLaunch.ThreadLaunchService)({
      checkWorktreeBase: () => Effect.void,
      launch: (launch) => {
        input.launched.push(launch);
        return input.launchFails
          ? Effect.fail(
              new ThreadLaunch.ThreadLaunchError({
                operation: "create-thread",
                commandId: launch.commandId,
                projectId: launch.projectId,
                cause: new Error("launch refused"),
              }),
            )
          : Effect.succeed({
              threadId: launch.threadId,
              projection: { thread: { id: launch.threadId }, runs: [] },
              resumed: false,
            } as unknown as ThreadLaunch.ThreadLaunchResult);
      },
    }),
    Layer.mock(ProviderRegistry.ProviderRegistry)({ getProviders: Effect.succeed([]) }),
    SpaceService.layer.pipe(Layer.provideMerge(SqlitePersistence.layerMemory)),
    DocumentText.layer,
  ).pipe(
    Layer.provideMerge(
      ServerConfig.layerTest(process.cwd(), { prefix: "t3-space-tool-" }).pipe(
        Layer.provide(NodeServices.layer),
      ),
    ),
    Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
  );
  return McpToolAccess.HandlersLayer.layer(SpaceHandlers.layer).pipe(
    Layer.provideMerge(dependencies),
  );
};

const spawn = (params: { readonly title: string; readonly message: string; ownWorktree?: true }) =>
  Effect.gen(function* () {
    const toolkit = yield* SpaceToolkit;
    const results = yield* toolkit
      .handle("t3_space_spawn_agent", params)
      .pipe(Stream.unwrap, Stream.runCollect);
    return [...results].at(-1)?.result;
  });

it.effect("opens a tab in the caller's space and folder, and refuses outside a space", () => {
  const launched: Array<ThreadLaunch.ThreadLaunchInput> = [];
  return Effect.gen(function* () {
    const spaces = yield* SpaceService.SpaceService;
    expect(yield* spawn({ title: "Tests", message: "Write the tests" })).toMatchObject({
      code: "invalid_request",
    });
    expect(launched).toEqual([]);

    const space = yield* spaces.create({ name: "Checkout", threadIds: [callerId] });
    expect(yield* spawn({ title: "Tests", message: "Write the tests" })).toMatchObject({
      spaceId: space.id,
    });
    yield* spawn({ title: "Styles", message: "Restyle the card", ownWorktree: true });

    expect(launched).toMatchObject([
      {
        projectId,
        modelSelection,
        workspaceStrategy: { type: "existing_worktree", worktreePath },
        initialMessage: { text: "Write the tests", senderThreadId: callerId },
        createdBy: "agent",
      },
      { workspaceStrategy: { type: "worktree", baseRef: "feat/checkout", startFromOrigin: false } },
    ]);
    expect((yield* spaces.list()).spaces[0]?.threadIds).toEqual([
      callerId,
      launched[0]?.threadId,
      launched[1]?.threadId,
    ]);
  }).pipe(Effect.provide(layerFor({ launched })));
});

it.effect("leaves no tab behind when the launch fails", () => {
  const launched: Array<ThreadLaunch.ThreadLaunchInput> = [];
  return Effect.gen(function* () {
    const spaces = yield* SpaceService.SpaceService;
    yield* spaces.create({ name: "Checkout", threadIds: [callerId] });
    expect(yield* spawn({ title: "Tests", message: "Write the tests" })).toMatchObject({
      code: "orchestration_error",
    });
    expect(launched).toHaveLength(1);
    expect((yield* spaces.list()).spaces[0]?.threadIds).toEqual([callerId]);
  }).pipe(Effect.provide(layerFor({ launched, launchFails: true })));
});
