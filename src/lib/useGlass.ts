import { useEffect, useRef, type RefObject } from 'react'
import { liquidGlass, type GlassOptions } from './liquidGlass'

/**
 * Give a floating control a refracting rim for as long as it is on screen.
 *
 * Returns a ref to hand to the element. Where the browser cannot refract —
 * every browser on iOS, and Firefox — this does nothing at all and the
 * element keeps the frosted material its stylesheet already gave it.
 *
 * The options are read once, on mount. A control whose glass needs to
 * change while it is up is not a thing this app has.
 */
export function useGlass<T extends HTMLElement>(options: GlassOptions = {}) {
  const ref = useRef<T>(null)
  const opts = useRef(options)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const glass = liquidGlass(node, opts.current)
    return () => glass.destroy()
  }, [])

  return ref
}

/**
 * The same, for an element whose ref something else already owns — a modal
 * that holds one to move focus into, for instance.
 */
export function useGlassOn(
  target: RefObject<HTMLElement | null>,
  options: GlassOptions = {},
  deps: unknown[] = [],
) {
  const opts = useRef(options)

  useEffect(() => {
    const node = target.current
    if (!node) return
    const glass = liquidGlass(node, opts.current)
    return () => glass.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * The same, for a set of elements that arrive together — a menu's items, a
 * row of chips. One call glasses all of them and tears them all down.
 *
 * It takes the container's own ref rather than making one, because the
 * containers that need this already have a ref for something else and two
 * refs on one node is a callback nobody should have to read.
 */
export function useGlassGroup(
  root: RefObject<HTMLElement | null>,
  selector: string,
  options: GlassOptions = {},
  deps: unknown[] = [],
) {
  const opts = useRef(options)

  useEffect(() => {
    const node = root.current
    if (!node) return
    const panes = [...node.querySelectorAll<HTMLElement>(selector)]
      .map((el) => liquidGlass(el, opts.current))
    return () => panes.forEach((p) => p.destroy())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
