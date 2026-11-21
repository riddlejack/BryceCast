import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppV3 } from './app/AppV3';
import { REVIEW_HOST, applyCssSwitches } from './review/switches';

applyCssSwitches();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppV3 />
  </React.StrictMode>
);

// Jack's review switchboard (bottom left, ` key): the review copy only, never brycecast.com; its own chunk.
if (REVIEW_HOST) void import('./review/board').then((board) => board.start());
