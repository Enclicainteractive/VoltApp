import { useLayoutEffect, useRef } from 'react'

const resetNodeScroll = (node) => {
  if (!node) return
  node.scrollTop = 0
  node.scrollLeft = 0
}

export const useResetScrollOnChange = (deps = []) => {
  const scrollRef = useRef(null)

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return undefined

    resetNodeScroll(node)
    const frameId = window.requestAnimationFrame(() => {
      resetNodeScroll(node)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, deps)

  return scrollRef
}

export default useResetScrollOnChange
