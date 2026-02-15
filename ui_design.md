# UI/UX Design Specification (Management Web App)

## 1. Design Concept
*   **Theme:** Professional, Clean, High-density information.
*   **Framework:** Use Vue.js (CDN) + Tailwind CSS (or similar utility classes) for rapid styling within GAS.

## 2. Page Layouts

### 2.1 Equipment Management (Asset Manager)
*   **Reference Style:** "Blitz GROW"
*   **Layout Structure:** 3-Pane "Holy Grail" Layout (Fixed height, scrollable panes).
    *   **Left Pane (20% width):** [Equipment Tree]
        *   Interactive hierarchical tree view (Facility > Building > Equipment > Part).
        *   Icons distinguishing types (Pump, Valve, Panel).
    *   **Center Pane (50% width):** [Detail & Map]
        *   Top: Basic info table (ID, Name, Spec, Photo).
        *   Bottom: Google Maps integration showing exact location.
    *   **Right Pane (30% width):** [Activity Timeline]
        *   Vertical timeline showing history (Inspection -> Alert -> Repair -> Replacement).
        *   Color-coded events (Blue=Check, Red=Repair, Green=Install).

### 2.2 Personnel Management (HR)
*   **Reference Style:** "SmartHR"
*   **Layout Structure:** Card Grid Layout.
    *   **Grid:** Responsive grid (auto-fill minmax 250px).
    *   **Card Component:**
        *   Top: Employee Photo (Circular or Rounded Square).
        *   Middle: Name (Bold), Role, Department.
        *   Bottom: Skill Tags (e.g., "Electrician", "Safety Officer").
    *   **Interaction:** Clicking a card opens a Modal with detailed history and qualifications.

### 2.3 Navigation
*   **Global Header:** Dark theme navigation bar with logo and module switcher (Equipment / 