import type * as React from "react"

/**
 * React-19 type typings removed the global `JSX` namespace (it now lives
 * under `React.JSX`). This prototype was written against the old global
 * references; re-export the members it uses so `tsc` keeps resolving them
 * without touching twenty files in a frozen reference app.
 */
declare global {
  namespace JSX {
    type Element = React.JSX.Element
    type ElementClass = React.JSX.ElementClass
    type ElementAttributesProperty = React.JSX.ElementAttributesProperty
    type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute
    type IntrinsicAttributes = React.JSX.IntrinsicAttributes
    type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<T>
    type IntrinsicElements = React.JSX.IntrinsicElements
  }
}

export {}
