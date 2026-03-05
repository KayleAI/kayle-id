# AI Engineering Rules

These rules exist to ensure that AI-generated contributions maintain **senior-level engineering quality**, avoid duplication, and respect the architecture of the codebase.

AI agents and contributors must follow these rules strictly.

---

# Core Philosophy

The AI **must never invent structure**.

Architecture, patterns, and boundaries already exist in the repository. The AI's job is to **extend and maintain them**, not redesign them.

Prefer:

- modifying existing code
- reusing existing abstractions
- minimal diffs

Avoid:

- parallel implementations
- unnecessary abstractions
- architectural drift

---

# Mandatory Workflow

For any non-trivial change, follow this workflow.

## 1. Analyse Existing Code

Before writing any code:

- Search the repository for existing implementations.
- Identify patterns used in similar modules.
- Reuse existing utilities, services, hooks, or helpers.

Never implement functionality that already exists.

---

## 2. Plan Changes

Before implementation, determine:

- which files will change
- which functions will be modified
- whether existing logic can be reused
- whether any duplication can be removed

Prefer modifying existing code over adding new files.

---

## 3. Implement Minimal Changes

Implement the **smallest possible change** that solves the problem.

Rules:

- avoid unnecessary refactors
- avoid renaming unrelated code
- avoid moving files unless required
- avoid formatting-only commits

The diff should be as small and targeted as possible.

---

# Code Reuse Rules

## Search Before Creating

Before creating:

- functions
- utilities
- hooks
- services
- components
- types

you **must search the codebase** for an existing equivalent.

If a similar implementation exists:

- extend it
- refactor it
- or reuse it

Do **not** duplicate logic. And only create new files if absolutely necessary.

---

## One Concept, One Implementation

If multiple pieces of code implement the same behaviour:

- consolidate them
- remove duplication
- move shared logic to the appropriate layer

The codebase should maintain a **single source of truth** for each behaviour.

---

# Architectural Boundaries

Follow the architecture used by the repository.

General rules:

- UI components must not contain business logic
- Business logic must live in services/domain modules
- Data access should be isolated behind repository or data-layer abstractions
- Utilities must remain pure and side-effect free

Never mix these responsibilities.

---

# Dependency Rules

AI must not introduce new dependencies without explicit instruction.

Before adding a dependency:

- verify it does not already exist
- prefer internal utilities
- prefer native platform features

If external libraries are required, the AI must request approval.

---

# Import Rules

Prefer importing from existing internal modules.

Avoid:

- deep relative paths when aliases exist
- duplicate utility imports
- unused imports

Imports must follow the repository's existing ordering conventions.

---
# Component Rules (React)

React components must remain **thin orchestration layers**.

Components may:

- call hooks
- render UI
- trigger actions

Components must not:

- implement business logic
- contain complex data transformations
- duplicate domain logic

Complex logic must be moved into hooks, services, or domain modules.

---

# Function Design

Functions should follow these principles:

- small and focused
- single responsibility
- clear input/output behaviour

Prefer:

- early returns
- descriptive naming
- explicit types

Avoid:

- deeply nested conditionals
- hidden side effects
- large functions

---

# Abstraction Rules

Do not introduce new abstractions unless they are justified.

Acceptable reasons:

- eliminating duplication
- enforcing architectural boundaries
- improving testability

Unacceptable reasons:

- “future flexibility”
- speculative generalisation
- personal preference

If an abstraction is added, existing code must be updated to use it.

---

# Duplication Prevention

Duplication is considered a critical code quality issue.

Before committing code:

- search for similar logic
- consolidate duplicated behaviour
- reuse shared functions

If duplication is discovered, it must be resolved during the same change.

---

# Error Handling

Errors must be handled consistently across the codebase.

Rules:

- throw `Error` objects
- use descriptive messages
- avoid silent failures

Do not swallow errors unless explicitly required.

---

# Type Safety

TypeScript types must be treated as part of the architecture.

Rules:

- prefer explicit return types for exported functions
- avoid `any`
- prefer `unknown` when necessary
- use narrowing instead of assertions

Types should model domain concepts clearly.

---

# Code Changes Must Remain Consistent With Existing Patterns

Before writing new code, examine nearby files and follow:

- naming conventions
- file structure
- dependency patterns
- architectural boundaries

Consistency with the repository is more important than theoretical best practices.

---

# Performance Awareness

Avoid common performance pitfalls:

- unnecessary object/array allocations in loops
- repeated expensive computations
- recreating regex objects in loops
- unnecessary re-renders in React

Follow performance patterns already used in the repository.
Do not introduce new optimisation techniques unless necessary.

---

# No Parallel Implementations

AI must never introduce a second implementation of existing functionality.

Examples:

❌ create a second API client
❌ create another validation utility
❌ create a duplicate hook

Instead:

✔ extend the existing implementation
✔ refactor the existing module
✔ reuse shared utilities

---

# Testing Expectations

Changes that affect behaviour must include appropriate tests.

Tests should:

- verify behaviour
- remain deterministic
- avoid unnecessary complexity

Tests must not be skipped or disabled.

---

# Definition of Done

A change is complete only if:

- no duplication was introduced
- existing patterns were respected
- architecture boundaries remain intact
- naming is meaningful
- TypeScript types remain safe
- linting and formatting pass

---

# AI Output Expectations

AI-generated code must:

- integrate cleanly with existing modules
- avoid unnecessary abstractions
- reuse existing code
- produce minimal diffs
- follow repository conventions

If uncertain about architecture or module placement, the AI must **ask for clarification instead of guessing**.

---

# Final Rule

The AI must prioritise:

**clarity, reuse, consistency, and maintainability over cleverness or novelty.**

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `bun x ultracite fix` before committing to ensure compliance.
