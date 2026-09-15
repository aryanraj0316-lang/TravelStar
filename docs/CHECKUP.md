# MASTER PROMPT — AUTONOMOUS FULL-APP QA

Act as a **senior software engineer + QA engineer + integration tester**. Your job is to discover, understand, and aggressively test the **actual application in this codebase**.

## 1. DISCOVER FIRST — DO NOT ASSUME FEATURES

Do NOT use a predefined feature list.

First inspect the entire codebase and determine what is actually implemented:

* screens, tabs, navigation and routes
* buttons, forms, gestures and interactions
* frontend state and local storage
* APIs and backend routes
* database models/queries
* authentication/authorization
* external integrations
* notifications, messaging, uploads, etc. **only if actually implemented**
* conditional/hidden functionality
* loading, empty, error and success states
* mock/placeholder functionality

Build an internal map of the application's real features.

**Never invent functionality that does not exist.**

---

## 2. UNDERSTAND HOW FEATURES CONNECT

Do NOT treat each screen or tab as an isolated feature.

For every discovered feature, determine:

* What data does it create/read/update/delete?
* Where does that data come from?
* Which other screens/features use that data?
* Which other features can modify it?
* What side effects should occur?
* Which APIs/backend/database operations are involved?
* Can the feature be reached from multiple places?

Build a mental **feature dependency graph**.

For example, if Feature A changes data used by Features B and C, test:

`A → B`

`A → C`

Then, where supported:

`B → A`

`C → A`

Do the same for **tabs, screens, profile, booking, messaging, history, notifications, settings, etc. only when the actual code connects them.**

---

## 3. TEST FEATURES BOTH INDIVIDUALLY AND AS A SYSTEM

For every discovered feature, test:

### Normal flow

* expected inputs
* successful completion
* navigation
* resulting UI/state

### Edge cases

* empty input
* invalid input
* unusual input
* repeated actions
* rapid taps
* cancellation
* back navigation
* leaving and returning
* refresh/retry

### Failure states

* API failure
* slow network
* network loss
* timeout
* server error
* missing/invalid data
* permission/authentication failure where applicable

### Persistence

After an important action:

* leave the screen
* switch tabs
* revisit it
* restart the app
* re-login if applicable
* verify the data still exists and is consistent

---

## 4. TEST CROSS-FEATURE / CROSS-TAB FLOWS

This is a critical part of the test.

Whenever Feature A changes something that another feature can see or depend on, follow the data through the application.

Example pattern:

`Create/Update in A`
→ `verify B`
→ `verify C`
→ `verify backend/database`
→ `return to A`
→ `verify consistency`

Also test the reverse direction whenever possible.

Look specifically for:

* stale data
* missing updates
* duplicate records
* broken navigation
* incorrect counters/badges
* inconsistent profile/history/details
* frontend/backend disagreement
* state that updates in one tab but not another
* deleted data still appearing elsewhere
* changes appearing in UI but not being persisted

**A feature is not considered fully working just because its own screen works. Its connected features must also remain correct.**

---

## 5. TRACE IMPORTANT FLOWS END-TO-END

For every meaningful backend-connected feature, verify:

`UI → frontend state → API → backend → database/external service → response → frontend state → UI`

Do not trust a "Success" message.

Verify that the underlying operation actually happened.

Look for:

* wrong API endpoints
* incorrect request/response fields
* broken backend logic
* database failures
* incorrect IDs
* stale cache
* frontend/backend contract mismatches
* fake/mock data
* UI-only implementations

---

## 6. TEST REALISTIC + CHAOTIC USER BEHAVIOR

Try to break the application through unexpected but realistic sequences:

* rapidly tap buttons
* submit twice
* switch tabs during an operation
* navigate back during loading
* close/reopen screens
* cancel midway
* refresh repeatedly
* lose network during a request
* perform actions in unusual orders
* restart the app midway through a flow
* modify something from one screen and immediately inspect it elsewhere

Look for crashes, race conditions, duplicate operations, corrupted state and inconsistent data.

---

## 7. DISCOVER HIDDEN OR PARTIAL FUNCTIONALITY

Look for:

* hidden routes
* conditional screens
* feature flags
* role-based functionality
* long-press/swipe actions
* unreachable implementations
* buttons with incomplete handlers
* mock/placeholder functionality
* backend functionality with no frontend connection

Classify functionality as:

* **WORKING**
* **PARTIALLY WORKING**
* **BROKEN**
* **IMPLEMENTED BUT UNREACHABLE**
* **UI-ONLY / MOCK / PLACEHOLDER**

Do not call something "broken" simply because it does not exist.

---

## 8. FIX AND RETEST

If you are authorized to modify the code:

1. Find the root cause.
2. Make a minimal production-quality fix.
3. Retest the original failure.
4. Retest related features and connected tabs/screens.
5. Perform regression testing on anything affected by the change.

Do not stop after fixing the first bug.

---

## 9. FINAL SECOND-PASS AUDIT

After testing everything discovered, review the application again and ask:

* Did I discover every implemented feature?
* Did I test every meaningful interaction?
* Did I test cross-screen and cross-tab dependencies?
* Did I follow shared data between features?
* Did I test important features from multiple entry points?
* Did I verify frontend/backend/database flows?
* Did I test persistence?
* Did I test failure and recovery?
* Did I test interruptions and unusual user behavior?
* Did I find mocks, placeholders and unreachable functionality?
* Did I regression-test fixes?
* Is anything discovered still untested? If yes, explain why.

---


### 🚨 MANDATORY: CROSS-SCOPE FEATURE TESTING

**Never consider a feature tested just because it works on the screen where it appears.**

Every option and feature must be tested across **multiple stages, screens, tabs, states, and workflows of the entire application** wherever it is connected.

For each feature, verify:

* Every meaningful entry point
* Every connected screen/tab
* Data/state propagation across the app
* Creation → modification → completion → cancellation/deletion
* Navigation, refresh, restart, relogin, and persistence
* Interactions with other connected features
* Frontend → API → backend → database → UI consistency
* Failure, interruption, repeated-action, and edge cases

### 🔴 HIGH-PRIORITY FEATURES

Give **extra attention** to:

* **Travel Guide**
* **Budget Tracker**
* **Trip Creation**
* **Bookings**
* **Stories**
* **Notifications**
* **Maps**
* **Chat**

These must **not** be tested as isolated features. Test each one across its **entire connected scope of the application**, including every other feature, screen, tab, workflow, and data/state that the actual code shows it can affect.

**Core rule:**

> If a feature works on one screen, that is only one test. It must also be tested wherever else that feature can affect or interact with the application.

**Do not stop at the current screen. Trace the feature throughout the entire app.**


# FINAL REPORT

Provide:

### Feature Coverage

* Features discovered
* Features tested
* Cross-feature flows tested
* Cross-tab flows tested
* End-to-end flows tested

### Results

* Working
* Partially working
* Broken
* Mock/placeholder
* Unreachable

### Bugs

For each important bug:

**Title → Severity → Steps → Expected → Actual → Root Cause → Affected Features → Fix/Status**

### Final Verdict

Clearly state:

**PRODUCTION READY / READY WITH FIXES / NOT PRODUCTION READY**

Base this entirely on evidence from the actual codebase and testing.

## NON-NEGOTIABLE RULE

**Do not test what you assume the application should have. Discover what it actually has, understand how those features connect, and then aggressively test those connections as well as the individual features.**

The goal is not to complete a checklist.

**The goal is to find anything that can actually break in the real application.**
