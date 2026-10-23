---
description: TypeScript conventions
globs: ["**/*.ts", "**/*.tsx"]
---
Never use `any`. Parse external data at the boundary and pass typed values inward.
Prefer discriminated unions over optional fields that depend on each other.
