import { act, renderHook } from "@testing-library/react-hooks"
import { useCallback, useMemo, useState } from "react"
import useAwaitData from "./index.ts"

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe("useAwaitData", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it("should not re-render at first run", async () => {
    const render = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const result = useAwaitData(async () => {
        return await wait(2000)
      })
      render()
      return { result }
    })
    expect(render).toHaveBeenCalledTimes(1)
  })

  it("should handle fulfillments", async () => {
    const render = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const result = useAwaitData(async () => {
        return await wait(2000)
      })
      render()
      return { result }
    })
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(2000)
    expect(result.current.result.status).toBe("running")
    expect(render).toHaveBeenCalledTimes(1)
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("fulfilled")
    expect(render).toHaveBeenCalledTimes(2)
  })

  it("should handle rejections", async () => {
    const render = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const result = useAwaitData(async () => {
        throw await new Promise(resolve =>
          setTimeout(resolve, 2000, new Error()),
        )
      })
      render()
      return { result }
    })
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(2000)
    expect(result.current.result.status).toBe("running")
    expect(render).toHaveBeenCalledTimes(1)
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("rejected")
    expect(render).toHaveBeenCalledTimes(2)
  })

  it("should handle dependencies update before the first run settles", async () => {
    const render = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const [state, setState] = useState({})
      const update = useCallback(() => setState({}), [])
      const result = useAwaitData(async () => {
        return await wait(2000)
      }, [state])
      render()
      return { result, update } as const
    })
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(render).toHaveBeenCalledTimes(1)
    act(result.current.update)
    expect(render).toHaveBeenCalledTimes(2)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("fulfilled")
    expect(render).toHaveBeenCalledTimes(3)
  })

  it("should handle dependencies update after the first run settled", async () => {
    const render = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const [state, setState] = useState({})
      const update = useCallback(() => setState({}), [])
      const result = useAwaitData(async () => {
        return await wait(2000)
      }, [state])
      render()
      return { result, update } as const
    })
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(render).toHaveBeenCalledTimes(1)
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("fulfilled")
    expect(render).toHaveBeenCalledTimes(2)
    act(result.current.update)
    expect(render).toHaveBeenCalledTimes(3)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("fulfilled")
    expect(render).toHaveBeenCalledTimes(4)
  })

  it("should handle dependencies update after the first run aborted but tick isn't used", async () => {
    const render = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const [state, setState] = useState({})
      const update = useCallback(() => setState({}), [])
      const result = useAwaitData(async () => {
        return await wait(2000)
      }, [state])
      render()
      return { result, update } as const
    })
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(render).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.result.status === "running" &&
        result.current.result.abort()
    })
    expect(result.current.result.status).toBe("aborted")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("aborted")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("aborted")
    expect(render).toHaveBeenCalledTimes(2)
    act(result.current.update)
    expect(render).toHaveBeenCalledTimes(3)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("fulfilled")
    expect(render).toHaveBeenCalledTimes(4)
  })

  it("should abort `AbortController` at abort request", async () => {
    const render = jest.fn()
    const abort = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const [state, setState] = useState({})
      const update = useCallback(() => setState({}), [])
      const result = useAwaitData(
        async ({ signal }) => {
          signal.onabort = () => abort(true)
          return await wait(2000)
        },
        [state],
      )
      render()
      return { result, update } as const
    })
    expect(result.current.result.status).toBe("running")
    expect(abort).toHaveBeenCalledTimes(0)
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(abort).toHaveBeenCalledTimes(0)
    expect(render).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.result.status === "running" &&
        result.current.result.abort()
    })
    expect(result.current.result.status).toBe("aborted")
    expect(abort).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledTimes(2)
  })

  it("should abort `AbortController` at invalidate", async () => {
    const render = jest.fn()
    const abort = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const [state, setState] = useState({})
      const update = useCallback(() => setState({}), [])
      const result = useAwaitData(
        async ({ signal }) => {
          signal.onabort = () => abort(true)
          return await wait(2000)
        },
        [state],
      )
      render()
      return { result, update } as const
    })
    expect(result.current.result.status).toBe("running")
    expect(abort).toHaveBeenCalledTimes(0)
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(abort).toHaveBeenCalledTimes(0)
    expect(render).toHaveBeenCalledTimes(1)
    act(result.current.update)
    expect(render).toHaveBeenCalledTimes(2)
    expect(result.current.result.status).toBe("running")
    expect(abort).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(abort).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(abort).toHaveBeenCalledTimes(1)
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("fulfilled")
    expect(render).toHaveBeenCalledTimes(3)
  })

  it("should update result at re-run", async () => {
    const render = jest.fn()
    const resultUpdated = jest.fn()
    const { result, waitForNextUpdate } = renderHook(() => {
      const [state, setState] = useState({})
      const update = useCallback(() => setState({}), [])
      const result = useAwaitData(async () => {
        return await wait(2000)
      }, [state])
      useMemo(() => {
        resultUpdated()
      }, [result])
      render()
      return { result, update } as const
    })
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    expect(render).toHaveBeenCalledTimes(1)
    expect(resultUpdated).toHaveBeenCalledTimes(1)
    act(result.current.update)
    expect(render).toHaveBeenCalledTimes(2)
    expect(resultUpdated).toHaveBeenCalledTimes(2)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    jest.advanceTimersByTime(1000)
    expect(result.current.result.status).toBe("running")
    await waitForNextUpdate()
    expect(result.current.result.status).toBe("fulfilled")
    expect(render).toHaveBeenCalledTimes(3)
    expect(resultUpdated).toHaveBeenCalledTimes(3)
  })
})