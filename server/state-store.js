/**
 * MANIEDUHUB State Store
 * NUCLEAR OPTION: Purely in-memory storage to ensure Vercel deployment works 100%.
 * SQLite on Vercel is not recommended as it deletes data on every restart.
 */

let memoryState = null;

function defaultState() {
  return {
    students: [],
    content: {
      library: null,
      quizzes: null,
      leaderboards: {},
      notifications: [],
      videoLink: null,
      aboutData: null,
      aiLinks: null,
      subjects: null,
    },
  };
}

function initStore() {
  console.log("Initializing in-memory store.");
  memoryState = defaultState();
}

function readState() {
  return memoryState || defaultState();
}

function writeState(state) {
  memoryState = JSON.parse(JSON.stringify({
    students: Array.isArray(state.students) ? state.students : [],
    content: { ...defaultState().content, ...(state.content || {}) },
  }));
}

module.exports = {
  initStore,
  readState,
  writeState,
  dbPath: "memory",
};
