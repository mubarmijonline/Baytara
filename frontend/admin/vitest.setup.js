// The same deadline as the website suite, for the same reason. Testing Library's async
// helpers default to one second, and this box is shared: at a load of 15 on two cores a
// page that renders in 200 ms idle takes over a second, and a different test failed on
// each full run while every one of them passed alone. A genuinely broken query still
// fails, it just takes five seconds to say so.
import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5000 });
