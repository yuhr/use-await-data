import { useCallback, useMemo, useRef, useState } from "react"

const symbolInvalidate: unique symbol = Symbol()
const symbolAborted: unique symbol = Symbol()

const useRerender = () => {
  const [, setRerender] = useState({})
  const rerender = useCallback(() => setRerender({}), [])
  return rerender
}

/**
 * A React hook that executes an async task to populate the desired data.
 *
 * @param task - An async function to execute.
 * @param dependencies - Dependencies this hook refers to.
 * @returns An object representing the status of the async function.
 *
 * Example Usage:
 *
 * > ```tsx
 * > const ShowData = ({ query }: { query: Query }) => {
 * >   const result = useAwaitData(
 * >     async ({ tick, signal }) => {
 * >       const a = await someTask(query)
 * >       tick = await tick()
 * >       const b = await anotherTask(a)
 * >       tick = await tick()
 * >       return await lastTask(b)
 * >     },
 * >     [query, someTask, anotherTask, lastTask],
 * >   )
 * >   switch (result.status) {
 * >     case "fulfilled":
 * >       return <Show value={result.value} />
 * >     case "rejected":
 * >       return <ShowError message={result.error.message} />
 * >     case "running":
 * >       return <ShowLoading onAbort={result.abort} />
 * >     case "aborted":
 * >       return <ShowAborted />
 * >   }
 * > }
 * > ```
 *
 * **_Every update of the dependencies causes a re-run of the task!_** This hook
 * automatically invalidates the execution of the stale task. When a invalidate
 * occurs, the old task will be handled as if it was aborted (abort process is
 * described in the further paragraphs), but the resulting status remains as
 * `"running"` until the new task run settles. Please pay attention to your
 * dependencies — you should avoid unnecessary updates as much as possible in
 * order to prevent the task from wasted runs. For this reason, unlike React's
 * `useEffect` hook, the task function is run at only the first time even if
 * `dependencies` parameter was not provided.
 *
 * When the `status` property of the result object is `"running"`, you can
 * access to the `abort` property which is a `() => void` to request abort to
 * the scheduler. Note that `abort` only works while the status is `"running"`,
 * otherwise it's just a no-op.
 *
 * The first parameter of `task` function will be a
 * {@link useAwaitData.Scheduler `Scheduler`} object, whose shape is `{ tick: Tick;
 * signal: AbortSignal }` and {@link useAwaitData.Tick `Tick`} is `() =>
 * PromiseLike<Tick>`. You may want to call the `tick` function with some
 * idiomatic syntax like `tick = await tick()` periodically in the task
 * function, in order to handle aborting of the task — `tick` immediately
 * rejects once abort has been requested elsewhere, otherwise it immediately
 * resolves and allows you to continue further operations. You can also use the
 * `signal` which comes from an {@link AbortController `AbortController`} for
 * supported APIs such as `fetch`.
 *
 * Even if you don't use the `tick` function, once abort request has been filed,
 * this hook results in `"abort"` status immediately, and it won't change until
 * the next update of the dependencies, regardless of whether the task will have
 * successfully fulfilled or rejected. But if it's already in a settled status
 * such as `"fulfilled"` or `"rejected"`, `abort` function doesn't affect the
 * status.
 *
 * See these illustrations carefully to understand how it behaves:
 *
 * ---
 *
 * ```plain
 * Case #1 — Dependencies update before the first run settles
 * time:    |-------------------------------------------------------------------------->
 * event:   |<-initial call |<-deps update
 * run #0:  |===============|<-(invalidated)===>|<-reject at tick·····>|<-(est. settle)
 * run #1:                  |==============================>|<-resolve
 * status:  |<-running------|<-running--------------------->|<-fulfilled--------------->
 * ```
 *
 * ---
 *
 * ```plain
 * Case #2 — Dependencies update after the first run settled
 * time:    |-------------------------------------------------------------------------->
 * event:   |<-initial call                  |<--deps update
 * run #0:  |================>|<-reject
 * run #1:                                   |===============>|<-resolve
 * status:  |<-running------->|<-rejected--->|<-running------>|<-fullfilled------------>
 * ```
 *
 * ---
 *
 * ```plain
 * Case #3 — Dependencies update after the first run aborted but tick isn't used
 * time:    |-------------------------------------------------------------------------->
 * event:   |<-initial call  |<-abort      |<-deps update             |<-abort (ignored)
 * run #0:  |================|<-(abort requested but no tick)====>|<-resolve (ignored)
 * run #1:                                 |============>|<-resolve
 * status:  |<-running------>|<-aborted--->|<-running--->|<-fulfilled------------------>
 * ```
 */
const useAwaitData = <Value>(
  task: useAwaitData.AsyncTask<Value>,
  dependencies: unknown[] = [],
): useAwaitData.Result<Value> => {
  const tasks = useMemo(
    () => new Map<useAwaitData.AsyncTask<Value>, useAwaitData.Status>(),
    [],
  )
  const staleTaskRef = useRef<useAwaitData.AsyncTask<Value> | undefined>(
    undefined,
  )
  const staleAbortControllerRef = useRef<AbortController | undefined>(undefined)

  const abortController = useMemo(() => new AbortController(), dependencies)
  const abort = useCallback(() => {
    if (tasks.get(task) === "running") {
      updateResult({ status: "aborted" })
      abortController.abort()
      rerender()
    }
  }, dependencies)

  const resultRef = useRef<useAwaitData.Result<Value>>({
    status: "running",
    abort,
  })

  const rerender = useRerender()

  const updateResult = useCallback((result: useAwaitData.Result<Value>) => {
    resultRef.current = result
    tasks.set(task, result.status)
  }, dependencies)

  useMemo(() => {
    const onfulfilled = (value: Value) => {
      switch (tasks.get(task)) {
        case undefined: // This means it was invalidated
        case "aborted":
          // Nothing to do here, it's taken over by a newer task
          break
        default:
          updateResult({ status: "fulfilled", value })
          rerender()
      }
    }
    const onrejected = (error: unknown) => {
      switch (error) {
        case symbolInvalidate:
        case symbolAborted:
          // Nothing to do here, it's taken over by a newer task
          break
        default:
          updateResult({ status: "rejected", error })
          rerender()
      }
    }

    const tick = () =>
      new Promise<useAwaitData.Tick>((resolve, reject) => {
        switch (tasks.get(task)) {
          case undefined: // This means it should be invalidated
            reject(symbolInvalidate)
            break
          case "aborted":
            reject(symbolAborted)
            break
          default:
            resolve(tick)
        }
      })

    const { signal } = abortController
    const scheduler: useAwaitData.Scheduler = { tick, signal }

    // Invalidate the stale task
    if (staleTaskRef.current) tasks.delete(staleTaskRef.current)
    staleTaskRef.current = task
    updateResult({ status: "running", abort })
    if (staleAbortControllerRef.current) staleAbortControllerRef.current.abort()
    staleAbortControllerRef.current = abortController
    // Start the task
    task(scheduler).then(onfulfilled).catch(onrejected)
  }, dependencies)

  return resultRef.current
}

namespace useAwaitData {
  export type Result<Value> =
    | { status: "fulfilled"; value: Value }
    | { status: "rejected"; error: unknown }
    | { status: "running"; abort: () => void }
    | { status: "aborted" }

  export type AsyncTask<Value> = (scheduler: Scheduler) => Promise<Value>

  export type Status = Result<unknown>["status"]

  export type Tick = () => PromiseLike<Tick>

  export type Scheduler = { tick: Tick; signal: AbortSignal }
}

export default useAwaitData