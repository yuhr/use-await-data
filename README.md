# React Hook: `useAwaitData`

[![NPM](https://img.shields.io/npm/l/use-await-data)](LICENSE)
[![npm](https://img.shields.io/npm/v/use-await-data)](https://www.npmjs.com/package/use-await-data)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![microbundle](https://img.shields.io/badge/-📦%20microbundle-%23e3e7ea)](https://github.com/developit/microbundle)

`useAwaitData` is a React hook that executes an async task to populate the desired data.

## Features

- Invalidate stale executions
- Abort executions by a callback
- Minimum re-renders
- Zero-dependency
- React >= 17 support
- TypeScript support
- ESM/CJS/UMD support

## Example

```tsx
import useAwaitData from "use-await-data"

const ShowData = ({ query }: { query: Query }) => {
  const result = useAwaitData(
    async ({ tick, signal }) => {
      const a = await someTask(query)
      tick = await tick()
      const b = await anotherTask(a)
      tick = await tick()
      return await lastTask(b)
    },
    [query, someTask, anotherTask, lastTask],
  )
  switch (result.status) {
    case "fulfilled":
      return <Show value={result.value} />
    case "rejected":
      return <ShowError message={result.error.message} />
    case "running":
      return <ShowLoading onAbort={result.abort} />
    case "aborted":
      return <ShowAborted />
    // That's all!
  }
}
```

## TL;DR

### What's the Usage?

You can handle aborts of stale runs by doing:

- Insert `tick = await tick()` between every statement in your async function
- You can also use `signal` with [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)-compatible APIs such as `fetch`

Other usage is fully illustrated in the above example. You may also want to see [Illustrations of operating timelines](#illustrations-of-operating-timelines) section below.

### When to Use This Package

When you just want **the data** which requires some async tasks (e.g. search), that's what this package is for.

If you just want **to perform** async operation (e.g. visual effects), this package can do it but other similar packages would also work.

## Why?

You may notice there're already similar packages in the wild, such as [`use-async-effect`](https://www.npmjs.com/package/use-async-effect), [`@react-hook/async`](https://www.npmjs.com/package/@react-hook/async), etc. This package basically does the same thing as them, but our primary motivation is to handle re-runs of the async function efficiently.

This package has of course a functionality to abort manually, and also a functionality to automatically “invalidate” the previous run of the async function when the dependencies have been updated and the stale task is not settled yet. This will reduce unexpected state changes and thus re-renders of the component.

The returned object of `useAwaitData` always stands for the current run of the async function. Even if the invalidated run has settled while the current run is ongoing, the result of the invalidated run will be ignored and no re-render occur.

## Detailed Behavior and Usage

**_Every update of the dependencies causes a re-run of the task!_** This hook automatically invalidates the execution of the stale task. When a invalidate occurs, the old task will be treated as if it was aborted (abort process is described in the further paragraphs), but the resulting status remains as `"running"` until the new task run settles. Please pay attention to your dependencies — you should avoid unnecessary updates as much as possible in order to prevent the task from wasted runs. For this reason, unlike React's `useEffect` hook, the task function is run at only the first time even if `dependencies` parameter was not provided.

When the `status` property of the result object is `"running"`, you can access to the `abort` property which is a `() => void` to request abort to the scheduler. Note that `abort` only works while the status is `"running"`, otherwise it's just a no-op.

The first parameter of `task` function will be a `Scheduler` object, whose shape is `{ tick: Tick; signal: AbortSignal }` and `Tick` is `() => PromiseLike<Tick>`. You may want to call the `tick` function with some idiomatic syntax like `tick = await tick()` periodically in the task function, in order to handle aborting of the task — `tick` immediately rejects once abort has been requested elsewhere, otherwise it immediately resolves and allows you to continue further operations. You can also use the `signal` which comes from an `AbortController` for supported APIs such as `fetch`.

Even if you don't use the `tick` function, once abort request has been filed, this hook results in `"abort"` status immediately, and it won't change until the next update of the dependencies, regardless of whether the task will have successfully fulfilled or rejected. But if it's already in a settled status such as `"fulfilled"` or `"rejected"`, `abort` function doesn't affect the status.

## Illustrations of operating timelines

Asterisks (`*`) at the bottom of each graph indicate **_re-renders caused by `useAwaitData`_**. Note that these don't directly mean updates of the result object. Updates are indicated as vertical bars on the “status” lines.

### Case #1 — Dependencies update _before_ the first run settles

```plain
time:    |-------------------------------------------------------------------------->
event:   |<-initial call |<-deps update
run #0:  |===============|<-(invalidated)===>|<-reject at tick·····>|<-(est. settle)
run #1:                  |==============================>|<-resolve
status:  |<-running----->|<-running--------------------->|<-fulfilled--------------->
                                                         *
```

### Case #2 — Dependencies update _after_ the first run settled

```plain
time:    |-------------------------------------------------------------------------->
event:   |<-initial call                  |<--deps update
run #0:  |================>|<-reject
run #1:                                   |===============>|<-resolve
status:  |<-running------->|<-rejected--->|<-running------>|<-fullfilled------------>
                           *                               *
```

### Case #3 — Dependencies update _after_ the first run aborted but tick isn't used

```plain
time:    |-------------------------------------------------------------------------->
event:   |<-initial call  |<-abort      |<-deps update             |<-abort (ignored)
run #0:  |================|<-(abort requested but no tick)====>|<-resolve (ignored)
run #1:                                 |============>|<-resolve
status:  |<-running------>|<-aborted--->|<-running--->|<-fulfilled------------------>
                          *                           *
```