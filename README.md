# Mini React

A lightweight implementation of React's core concepts in under 400 lines of code, built for learning and understanding how React works under the hood. This project is based on the article [Build Your Own React.js in 400 Lines of Code](https://webdeveloper.beehiiv.com/p/build-react-400-lines-code).

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```

## Features

- Virtual DOM implementation with Fiber architecture
- Component-based architecture
- JSX support with createElement implementation
- State management with useState hook
- Event handling
- Asynchronous interruptible updates
- RequestIdleCallback for scheduling

## Implementation Details

This implementation includes:
- JSX to JavaScript compilation
- Fiber architecture for work unit management
- Reconciliation process for virtual DOM updates
- Hook system for state management
- MessageChannel-based scheduling system
