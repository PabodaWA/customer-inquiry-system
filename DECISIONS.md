# Design Decisions

## 1. Assumptions

- Intake staff are responsible for registering customer inquiries, while handlers work on inquiries assigned to them. Administrators manage staff, categories, and inquiry reassignment.
- Each inquiry should be assigned to an active handler whose specialization matches the inquiry category. If no suitable handler is available, the inquiry remains pending until an administrator takes action.
- Inquiry history and uploaded evidence should remain accessible only to users who have permission to view the relevant inquiry.
- The application should support initialization using a new, empty PostgreSQL database through the provided baseline schema migration.

## 2. Design Choices

### 2.1 Backend-Enforced Authorization

Role-based access control and inquiry ownership checks are enforced through the backend API rather than relying only on frontend restrictions. Access to inquiry lists, details, evidence, and history is limited according to the authenticated user's role and relationship to the inquiry. This helps prevent unauthorized access, including attempts to access records through direct API requests.

### 2.2 Workload-Based Automatic Assignment

Automatic assignment selects an active handler whose specialization matches the inquiry category. Among eligible handlers, the system prioritizes the handler with the lowest number of active inquiries across categories. If multiple handlers have equal workloads, a per-category rotation mechanism determines the next assignment. This approach aims to distribute work fairly and consistently.

### 2.3 Assignment Tracking and Inquiry History

The current handler assignment is maintained in the inquiry record, while the `inquiry_assignments` table stores assignment attempts and their outcomes. The `inquiry_history` table records important workflow events and status changes. This separation makes it easier to identify the current inquiry state while maintaining a record of previous actions.

## 3. Accepted Trade-off

Uploaded evidence files are validated and stored as binary data in PostgreSQL, then returned to authorized clients as data URLs. This approach keeps inquiry information and its attachments within the same database and avoids introducing an additional file storage service. However, it can increase database size and API response payloads. To reduce this impact, file uploads are restricted by file type, count, and size.

## 4. Future Improvements

- Introduce integration tests using a disposable PostgreSQL database to verify the complete inquiry lifecycle, authentication, authorization, and database transactions.
- Make the backend CORS origin configurable through environment variables to simplify deployment across different environments.
- Expand frontend test coverage to include important staff workflows such as login, inquiry creation, and status updates.

## 5. AI Usage

AI tools were used as development assistance for reviewing implementation approaches, troubleshooting errors, improving code structure, and refining technical documentation. AI suggestions were reviewed before being applied rather than accepted blindly.

One suggestion I accepted was to enforce authentication and authorization checks at the backend API level instead of relying only on frontend restrictions. This decision helps ensure that protected resources remain secure even when users attempt to bypass the interface.

All implementation decisions were reviewed against the application's requirements, and I remain responsible for understanding and explaining the submitted code.