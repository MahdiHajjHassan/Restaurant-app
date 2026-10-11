# Restaurant Websites | Guest, Owner, and Operator Journeys

> [!CAUTION]
> **Public application and design study.** The website features described here are grounded in the public source. Diagrams explain the product. Ordering is a separate design study; deployment, payments, automatic DNS verification and test results are not established by this showcase.

Each restaurant's site should feel like its own business. The shared application keeps onboarding and content maintenance consistent across restaurant accounts.

## The three experiences

| Person | Main task | Design decision |
| --- | --- | --- |
| Guest | Browse dishes, prices, availability, hours, and contacts. | A readable mobile menu and a clear English/Arabic choice. |
| Owner | Edit menus, photos, opening hours, and branding. | Controls grouped around the content being changed. |
| Operator | Create and support restaurant accounts and domains. | A visible restaurant identity, status, and support context. |

## From setup to guest browsing

1. The operator creates the restaurant account and owner access.
2. The owner selects branding and theme settings.
3. The owner organizes sections, dishes, sizes, prices, availability, and photos.
4. Guests browse the branded menu in English or Arabic.

## Product engineering decisions

- Separate customer browsing, menu editing, and platform support.
- Keep the active restaurant visible in administrative tools.
- Store prices as integers to avoid floating-point currency calculations.
- Keep language content paired and support right-to-left Arabic presentation.
- Apply restaurant-specific branding through reusable themes.

[Project overview](../README.md) · [Application architecture](portfolio-architecture.md)
