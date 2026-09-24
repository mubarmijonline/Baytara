// Testing Library's async helpers default to a 1s deadline, which is fine on an idle
// machine and not fine here: this box has two cores, and a full run has several suites
// rendering React trees in jsdom at once. Tests that pass alone every time were failing
// intermittently in full runs — different ones each time, always a `findBy*` timing out
// on a page that does render, just a little after the deadline.
//
// Raising the deadline does not hide a slow page. A genuinely broken query still fails,
// it just takes five seconds to say so.
import { configure } from '@testing-library/dom';

configure({ asyncUtilTimeout: 5000 });
