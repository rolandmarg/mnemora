# Technical Documentation

This directory contains technical documentation about the Mnemora architecture, code organization, and development practices.

## Documentation Index

### Architecture & Design

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - High-level architecture overview, components, and design patterns
- **[architecture-review-and-refactoring-plan.md](./architecture-review-and-refactoring-plan.md)** - 🔴 **CRITICAL** - Comprehensive architecture review, tech debt assessment, and refactoring plan for client base class implementation

### Business Logic

- **[BUSINESS_FLOWS.md](./BUSINESS_FLOWS.md)** - Business logic flows, birthday checking process, and orchestration

### Code Organization

- **[CODE_ORGANIZATION.md](./CODE_ORGANIZATION.md)** - Code structure, file organization, and conventions

## Quick Links

### 🚀 Getting Started with Refactoring

See **[architecture-review-and-refactoring-plan.md](./architecture-review-and-refactoring-plan.md)** for:
- Current architecture state analysis
- Tech debt assessment (HIGH PRIORITY items)
- Detailed BaseClient implementation plan
- Multi-channel architecture requirements
- Action plan with phases and priorities

### Key Findings Summary

**Tech Debt (High Priority):**
- ✅ Inconsistent client patterns across 7 clients
- ✅ Dependency injection complexity
- ✅ Configuration coupling
- ✅ X-Ray tracing duplication

**Critical Action Required:**
- 🔴 **Phase 1 (Week 1):** Create BaseClient class and migrate all clients
- 🟡 **Phase 2 (Week 2):** Standardize patterns and improve dependency injection
- 🟢 **Phase 3 (Weeks 3-4):** Multi-channel foundation

## Contributing

When adding new technical documentation:
1. Follow the existing markdown structure
2. Include code examples where helpful
3. Cross-reference related documents
4. Update this README with new entries


