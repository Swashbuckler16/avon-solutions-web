# Shipping platform reference audit

Inspected on 18 November 2026 using the account supplied by the user. Reference: https://app.eshipz.com/v2/fulfillment/orders/shipped?start_date=2026-11-11T00:00&end_date=2026-11-17T23:59

## Scope and evidence

This is a read-only product walkthrough and implementation brief for an independently built Avon application. It records visible UI and workflows, not the reference application's internal architecture. No orders, shipments, reports, settings, integrations, or customer messages were submitted or changed. No credentials, customer records, signed report URLs, or session tokens are included here.

The walkthrough covered every top-level navigation area, the central fulfillment forms, all analytics tabs, and representative settings. It is not an exhaustive test of every nested screen, permission, error path, or business rule. Actions that could change live operations were inspected as controls but not executed.

Evidence labels:

- **Inspected:** opened and read the screen or form.
- **Listed:** visible entry point or control; deeper behavior not verified.
- **Blocked:** explicit permission or activation restriction.

## Navigation and feature inventory

| Area | Observed functionality | Coverage |
|---|---|---|
| Authentication | Email/password, Google sign-in option, remember me, password recovery, email verification | Login inspected; recovery and Google flows not executed |
| Home | Greeting, postpaid balance card, date-scoped shipment/delivery/NDR/NPR cards, informational carousel, setup shortcuts | Inspected |
| Global shell | Collapsible sidebar, breadcrumbs, Quick Actions, What's New, user menu, light/dark options, support | Shell and Quick Actions inspected; theme/support behavior not exercised |
| Orders | New, Unprocessed, Cancelled, Shipped, All Orders, COD Orders; filtering, bulk search, column controls, pagination | Shipped screen and shared controls inspected |
| Order creation | Single order form; bulk import template selection, template download, mapper entry point | Both modes inspected; imports not submitted |
| Shipments | All, In-Process, Delivered, RTO, Cancelled; tracking filters, AWB/carrier table, create, upload tracking | Listing and create form inspected; tracking upload entry listed |
| POD | Delivery proof availability and verification metrics; AI verification banner; searchable table | Inspected; actual verification not exercised |
| Return | All, In-Process, Delivered, RTO, Cancelled, QA; Create and filters | Listing inspected; reverse submission not exercised |
| Exceptions | NDR and NPR queues, action-state tabs, summary metrics, bulk upload/search | Both queue screens inspected; action submissions not exercised |
| Analytics | Overview, Shipment, Order, NDR, NPR, NPS, Freight Audit, Hawk Eye | All opened; Hawk Eye activation blocked |
| Integrations | Carrier configuration, webhooks, marketplace | Carrier catalog inspected; webhooks/marketplace listed |
| Shipment setup | Shipping rules, packing allocation, carrier allocation, warehouse allocation, update tracking, warehouse management, package dimensions, SKU/HSN mapping | Landing, rule overview and warehouse listing inspected; other configuration forms listed |
| Reports | Standard, advanced and scheduled reports; generate dialog, downloads and email delivery | Standard list and generate dialog inspected; advanced/scheduled tabs listed |
| Company settings | Profile, billing, branding and preferences described on entry card | Blocked by permission |
| Sales channel integration | Order sync from marketplaces/websites described on entry card | Blocked by permission |

## Detailed workflows

### Orders

The requested Shipped view is an operational worklist. Its hierarchy is status tabs, a filter toolbar, a data table, and bottom pagination. A primary Create Order action sits at the top right.

Observed columns: Order ID, Customer, Items, Order Value, Payment Mode, Created Date, Updated Date, Channels, Tags. Rows contain selection checkboxes and an overflow menu. Visible row actions include Create Reverse Shipment, Pick List, Clone, Edit and Cancel. These actions were not submitted.

Filters include date/time and order source. More Filter exposes country, destination, payment mode, receiver ID, sender ID, SKU, state, store ID and tags. Bulk search accepts comma- or space-separated order IDs. Column configuration exposes visibility checkboxes, Reset and Confirm, with a minimum-five/maximum-eight configurable-column note. The list uses a default page size of 50, total count and first/previous/next/last navigation.

Sync Sales Orders and Auto Merge and Ship are visible toolbar actions; their side effects and matching rules remain unverified.

Single-order form groups:

1. Order reference, shipment type, order status, payment type, value and currency.
2. Seller and customer details in parallel columns: names, company, address, country, postal code, state, city, phone and email.
3. Repeatable item rows: name, SKU, HS code, value, quantity, weight and dimensions; aggregate quantity/weight/value.
4. Repeatable invoices: number, value, date and e-way bill number.
5. Repeatable boxes: package type, quantity, weight, dimensions and case number.
6. Sticky Back/Save Order footer.

Bulk mode offers a mapped-template selector, template download, file upload and Manage Mapper. The displayed instructions specify up to 5,000 rows, required headers and country codes, and CSV/XLS support. Parsing, mapping and error recovery need independent implementation and testing.

### Shipments and returns

Shipment lists add operational status, shipper, receiver, product, AWB, carrier/service, shipment date, expected delivery, actual delivery, appointment delivery and tags. Filters include payment mode, carrier identifier (displayed as “slug”), tracking status and order source.

Create Shipment exposes order search, Single/Bulk modes, Bulk Updates and Custom Ship. The form contains shipper/receiver addresses, a separate return warehouse option, shipment reference/type/purpose/AWB/description/payment, optional miscellaneous details, appointment delivery, invoices, boxes and optional international line items. It exposes Fetch Now and Add Another Shipment. The screen states carrier accounts and pickup warehouses must be configured first. Rate responses and final booking were not tested.

Return handling reuses the shipment-style list and has a QA tab. An order row can initiate a reverse shipment. Return eligibility, quality checks, refund behavior and final booking rules cannot be inferred from the list alone.

### Exceptions and delivery proof

NDR has All, Action Required, Action Requested, Delivered and RTO queues. NPR has All, Action Required, Action Requested and Picked Up. Both expose date filtering, search, summary counters and bulk uploads. Their operational actions should be modeled as requests with an audit trail and carrier responses, rather than merely changing a status badge.

POD provides delivered/available/unavailable/manual verification/pending/rejected counters. Its table includes customer reference, POD status, shipment ID, receiver, AWB, carrier, AI score, delivery date and shipment type. A premium AI banner says automated verification runs every 12 hours. This is a displayed product claim, not independently validated behavior. Start our product with document upload/viewing and manual verification; automated scoring is a separate optional feature.

### Analytics

- Overview: shipment/order/status totals; NDR, NPR, POD and freight summary cards; India state map; stale tracking over seven days; early/on-time/late delivery breakdown; carrier/status matrix; payment type and weight slabs. Several metrics drill into filtered worklists, and panels offer Excel export.
- Shipment: forward/reverse and exception summaries, invoice value, RTO by carrier, total weight, expected-versus-actual delivery and delivery attempts.
- Order: daily sales, order source, top products, top customers and channel performance sections.
- NDR: action types, non-delivery sub-reasons and carrier delivery attempts.
- NPR: pickup exceptions, carrier statistics and pickup attempts.
- NPS: date/carrier/user filters and a metrics area; detailed populated metrics were not verified.
- Freight Audit: date/carrier/type/user filters and a metrics area; reconciliation calculations were not verified.
- Hawk Eye: activation overlay for embedded external dashboards. Background sample-like numbers are not evidence of this account's operational data.

Analytics and some settings are embedded pages with visibly different styles. Our application can implement these as native routes with one consistent component system.

### Rules, warehouses, integrations and reports

Shipping rule overview lists pre-priority SKU-to-box and destination-to-warehouse allocation. Ordered presets include cost versus delivery time, share of business by weight, share of business by shipment count, payment/weight with ordered carrier priorities, and payment/weight service allocation. Rule editor details and conflict resolution were not tested.

Warehouses use a searchable card grid with type/city filters. Primary Pickup, Receiver and RTO warehouses are shown separately. Cards expose edit, delete and set-primary actions, plus bulk upload and add-new controls. These were not changed.

Carrier configuration separates configured providers from a large searchable provider catalog and describes shipment creation, tracking, POD and label generation. Carrier credentials were not opened or copied. Provider-specific configuration and available services will need official documentation and our own credentials.

Reports list report ID/name/source, date range, generated date, expiry, record count and download action. The Generate Report dialog includes date range, shipment mode, date type, carrier, tracking status, source, report type, AWB input and recipients. It supports downloading or sending by email; neither was executed. The reference displays five reports/day and up to five additional recipients. Those are reference limits, not requirements we must adopt.

## Layout and visual language

Desktop screenshots were inspected at approximately 1280 x 720. Mobile and dark-mode behavior remain unverified.

- Narrow teal icon rail, expandable to labeled navigation; full-width teal header with breadcrumbs and global actions.
- Pale gray-blue content background, white rounded cards, subtle borders/shadows and generous separation between table rows.
- Teal active tabs and primary buttons, pale cyan secondary controls, small colored status pills and compact icons.
- Montserrat is first in the body's computed font stack, followed by Roboto, Helvetica, Arial and sans-serif. Body base is 16px; table/control text appears smaller.
- Worklists prioritize tabs and filters above an internally scrolling table. Pagination remains at the bottom.
- Forms use white outer cards and pale blue field groups, floating labels, repeatable sub-tables and sticky action bars.
- Settings use title/description followed by icon cards. Warehouse pages use entity cards. Analytics uses metrics, charts, maps and comparison tables.

Suggested independent Avon design tokens (proposals, not measured reference values): primary #087F83, primary-dark #065E63, page #F3F6FA, surface #FFFFFF, text #172B3A, muted #5B6B79, border #DCE5EB; 4/8/12/16/24/32px spacing; 8px controls and 12px cards; 14px table text and 16px body text. Verify contrast and typography in the actual implementation.

Reusable components: AppShell, Sidebar, Breadcrumbs, StatusTabs, FilterBar, DateTimeRangePicker, FilterDrawer, BulkSearchDialog, DataTable, ColumnChooser, StatusBadge, RowActions, MetricCard, AddressFields, ItemRows, InvoiceRows, PackageRows, UploadWizard, EntityCard, ReportDialog and PermissionState.

Improvements to include: full-value tooltip/detail access for truncated references; user-facing “Carrier” instead of “slug”; consistent native analytics pages; labels on every icon button; keyboard-accessible tabs/dialogs; distinguish loading from empty data; preserve table filters in the URL; visible selection scope; useful import error rows; clear metric definitions. Dashboard totals differed between views during inspection, so date scope, refresh timing and calculation definitions must be explicit in our version.

## Limits and remaining discovery

- Administrator access is needed to inspect Company Settings and Sales Channel Integration. No permission changes were requested.
- Hawk Eye needs product activation; the inspected account cannot verify its actual operation.
- Carrier booking, cancellation, reverse booking, sync, auto-merge, printing/pick-list outputs, exception submissions, imports, report email and webhook deliveries were not executed.
- Deep editors for rules, mapper, package dimensions, SKU mapping, advanced/scheduled reporting and integration settings still need detailed specifications when their build phase begins.
- Actual tracking detail timelines, populated POD review, responsive layouts, dark theme, keyboard behavior, permission matrix and failure states need dedicated validation.
- The UI/UX skill's optional local search script was unavailable because Python could not run. No software was installed; recommendations above use the observed UI and manual review.

This brief supports a core implementation, but does not claim complete functional parity with inaccessible or unexecuted features.
