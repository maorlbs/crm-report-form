const MONDAY_API_URL = 'https://api.monday.com/v2';

const TEACHER_BOARD_ID = '5099392393';
const CONTACT_BOARD_ID = '5099207360'; // אנשי קשר - students now live here
const LESSON_BOARD_ID = '5101665472'; // דיווחי שעות
const REPORT_BOARD_ID = '5099392418'; // דפי חתימה
const PROJECT_BOARD_ID = '5102368610'; // ניהול חבילות/פרויקטים
const PROJECT_ACTIVE_GROUP_ID = 'topics'; // חבילות/פרויקטים פעילים

// New board_relation columns (created for this integration) that link into
// the contacts board - the pre-existing relation columns on these two boards
// are hard-configured to the old "לקוחות" board (5099392408) and can't accept
// items from the contacts board.
const LESSON_CONTACT_RELATION_COLUMN_ID = 'board_relation_mm6z7dqd'; // תלמיד מקושר (אנשי קשר)
const REPORT_CONTACT_RELATION_COLUMN_ID = 'board_relation_mm6zx3mc'; // תלמיד (אנשי קשר)

const TEACHER_EMAIL_COLUMN_ID = 'email_mm4sd8r9';
const TEACHER_PHONE_COLUMN_ID = 'phone_mm4sw9yw';
const TEACHER_PASSWORD_HASH_COLUMN_ID = 'long_text_mm6z3gae';
const TEACHER_MUST_RESET_COLUMN_ID = 'boolean_mm6zdwd3';

function getToken() {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error('MONDAY_API_TOKEN is not set. Copy .env.example to .env and add your monday.com API token.');
  }
  return token;
}

export async function executeGraphQL(query, variables = {}) {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getToken(),
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }

  return json.data;
}

export async function findItemIdByName(boardId, name) {
  if (!name) return null;

  const query = `
    query FindByName($boardId: ID!, $name: String!) {
      boards(ids: [$boardId]) {
        items_page(limit: 1, query_params: { rules: [{ column_id: "name", compare_value: [$name], operator: contains_text }] }) {
          items { id name }
        }
      }
    }
  `;

  const data = await executeGraphQL(query, { boardId, name });
  return data?.boards?.[0]?.items_page?.items?.[0]?.id || null;
}

export async function getAssetPublicUrls(assetIds) {
  if (!assetIds.length) return {};

  const query = `
    query GetAssets($ids: [ID!]!) {
      assets(ids: $ids) {
        id
        public_url
      }
    }
  `;

  const data = await executeGraphQL(query, { ids: assetIds });
  const map = {};
  for (const asset of data?.assets || []) {
    map[asset.id] = asset.public_url;
  }
  return map;
}

export async function uploadFileToColumn(itemId, columnId, fileBuffer, fileName, mimeType) {
  const formData = new FormData();
  formData.append(
    'query',
    `mutation ($file: File!) {
      add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) {
        id
      }
    }`
  );
  formData.append('variables[file]', new Blob([fileBuffer], { type: mimeType }), fileName);

  const response = await fetch('https://api.monday.com/v2/file', {
    method: 'POST',
    headers: { Authorization: getToken() },
    body: formData,
  });

  return response.json();
}

// --- Teachers / auth ---------------------------------------------------

export async function findTeacherByEmail(email) {
  const query = `
    query GetTeacher($email: String!) {
      boards(ids: [${TEACHER_BOARD_ID}]) {
        items_page(limit: 1, query_params: { rules: [{ column_id: "${TEACHER_EMAIL_COLUMN_ID}", compare_value: [$email], operator: contains_text }] }) {
          items {
            id
            name
            column_values(ids: ["${TEACHER_PHONE_COLUMN_ID}", "${TEACHER_PASSWORD_HASH_COLUMN_ID}", "${TEACHER_MUST_RESET_COLUMN_ID}", "${TEACHER_EMAIL_COLUMN_ID}"]) {
              id
              text
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query, { email });
  const item = data?.boards?.[0]?.items_page?.items?.[0];
  if (!item) return null;

  const col = (id) => item.column_values?.find((c) => c.id === id)?.text || '';

  return {
    id: item.id,
    name: item.name,
    email: col(TEACHER_EMAIL_COLUMN_ID),
    phone: col(TEACHER_PHONE_COLUMN_ID),
    passwordHash: col(TEACHER_PASSWORD_HASH_COLUMN_ID),
    mustResetPassword: col(TEACHER_MUST_RESET_COLUMN_ID) === 'v', // checkbox columns report "v" when checked
  };
}

export async function setTeacherPassword(teacherId, passwordHash, mustReset) {
  const mutation = `
    mutation SetPassword($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
        id
      }
    }
  `;
  await executeGraphQL(mutation, {
    boardId: TEACHER_BOARD_ID,
    itemId: teacherId,
    columnValues: JSON.stringify({
      [TEACHER_PASSWORD_HASH_COLUMN_ID]: { text: passwordHash },
      [TEACHER_MUST_RESET_COLUMN_ID]: { checked: mustReset ? 'true' : 'false' },
    }),
  });
}

export async function listAllTeachers() {
  const query = `
    query {
      boards(ids: [${TEACHER_BOARD_ID}]) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values(ids: ["${TEACHER_EMAIL_COLUMN_ID}", "${TEACHER_PHONE_COLUMN_ID}", "${TEACHER_MUST_RESET_COLUMN_ID}"]) {
              id
              text
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query);
  const items = data?.boards?.[0]?.items_page?.items || [];

  return items
    .map((item) => {
      const col = (id) => item.column_values?.find((c) => c.id === id)?.text || '';
      return {
        id: item.id,
        name: item.name,
        email: col(TEACHER_EMAIL_COLUMN_ID),
        phone: col(TEACHER_PHONE_COLUMN_ID),
        mustResetPassword: col(TEACHER_MUST_RESET_COLUMN_ID) === 'v',
      };
    })
    .filter((t) => t.email); // skip placeholder/blank rows with no email
}

// --- Students (אנשי קשר / contacts board) -------------------------------

export async function getStudentsForTeacher(teacherId) {
  const query = `
    query GetStudents {
      boards(ids: [${CONTACT_BOARD_ID}]) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values(ids: ["board_relation_mm6zhrja", "dropdown_mm6c4teq", "dropdown_mm6c3pqq", "contact_deal"]) {
              id
              text
              ... on BoardRelationValue {
                linked_item_ids
              }
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query);
  const allContacts = data?.boards?.[0]?.items_page?.items || [];

  return allContacts
    .filter((contact) => {
      const relation = contact.column_values?.find((c) => c.id === 'board_relation_mm6zhrja');
      const linkedIds = relation?.linked_item_ids || [];
      return linkedIds.includes(teacherId) || linkedIds.includes(String(teacherId)) || linkedIds.includes(Number(teacherId));
    })
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      column2: contact.column_values?.find((c) => c.id === 'dropdown_mm6c4teq')?.text || '',
      column3: contact.column_values?.find((c) => c.id === 'dropdown_mm6c3pqq')?.text || '',
    }));
}

async function getStudentDealId(studentId) {
  const query = `
    query GetDeal($itemId: ID!) {
      items(ids: [$itemId]) {
        column_values(ids: ["contact_deal"]) {
          ... on BoardRelationValue {
            linked_item_ids
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query, { itemId: studentId });
  return data?.items?.[0]?.column_values?.[0]?.linked_item_ids?.[0] || null;
}

// Finds the active package/project item (in the "חבילות/פרויקטים פעילים"
// group) linked to the same deal as this student, so a lesson report can be
// filed as a subitem under it. Returns null if no match is found.
//
// A student can end up with more than one matching item at once (e.g. a
// renewed package creates a new active item before the old one is closed
// out). When that happens, we must not split the same student's lessons
// across two different items: file only into the item that already has
// subitems on it, and leave an empty one untouched (it isn't "the" active
// item yet). If none of the matches have subitems yet, fall back to the
// first match, same as when there's only one.
export async function findActiveProjectItemForStudent(studentId) {
  const dealId = await getStudentDealId(studentId);
  if (!dealId) return null;

  const query = `
    query GetProjectItems {
      boards(ids: [${PROJECT_BOARD_ID}]) {
        groups(ids: ["${PROJECT_ACTIVE_GROUP_ID}"]) {
          items_page(limit: 500) {
            items {
              id
              name
              column_values(ids: ["board_relation_mm6ejnt5"]) {
                ... on BoardRelationValue {
                  linked_item_ids
                }
              }
              subitems {
                id
              }
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query);
  const items = data?.boards?.[0]?.groups?.[0]?.items_page?.items || [];

  const matches = items.filter((item) => {
    const linkedIds = item.column_values?.[0]?.linked_item_ids || [];
    return linkedIds.includes(dealId) || linkedIds.includes(String(dealId)) || linkedIds.includes(Number(dealId));
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;

  const withSubitems = matches.find((item) => (item.subitems || []).length > 0);
  return (withSubitems || matches[0]).id;
}

// Columns on the auto-generated "Subitems of ניהול חבילות/פרויקטים" board
// (5102368625), discovered via the parent board's subtasks column settings.
const PROJECT_SUBITEM_DATE_COLUMN_ID = 'date_mm6a5cb7';
const PROJECT_SUBITEM_START_HOUR_COLUMN_ID = 'hour_mm6avc3e';
const PROJECT_SUBITEM_END_HOUR_COLUMN_ID = 'hour_mm6afbwn';
const PROJECT_SUBITEM_TEACHER_NAME_COLUMN_ID = 'text_mm6amh5q';
const PROJECT_SUBITEM_SIGNATURE_COLUMN_ID = 'file_mm6ac7a9';
const PROJECT_SUBITEM_STUDENT_RELATION_COLUMN_ID = 'board_relation_mm6ahxf6'; // תלמידים -> אנשי קשר (5099207360)
const PROJECT_SUBITEM_TEACHER_RELATION_COLUMN_ID = 'board_relation_mm6axk81'; // מורים -> מורים (5099392393)

export async function createProjectSubitem(parentItemId, name, {
  studentId,
  teacherId,
  teacherName,
  date,
  startHour,
  startMinute,
  endHour,
  endMinute,
} = {}) {
  const mutation = `
    mutation CreateSubitem($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_subitem(parent_item_id: $parentItemId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;

  const columnValues = {};
  if (date) columnValues[PROJECT_SUBITEM_DATE_COLUMN_ID] = formatDateColumn(date);
  if (startHour !== undefined && startMinute !== undefined) {
    columnValues[PROJECT_SUBITEM_START_HOUR_COLUMN_ID] = { hour: startHour, minute: startMinute };
  }
  if (endHour !== undefined && endMinute !== undefined) {
    columnValues[PROJECT_SUBITEM_END_HOUR_COLUMN_ID] = { hour: endHour, minute: endMinute };
  }
  if (teacherName) columnValues[PROJECT_SUBITEM_TEACHER_NAME_COLUMN_ID] = teacherName;
  if (studentId) columnValues[PROJECT_SUBITEM_STUDENT_RELATION_COLUMN_ID] = { item_ids: [Number(studentId)] };
  if (teacherId) columnValues[PROJECT_SUBITEM_TEACHER_RELATION_COLUMN_ID] = { item_ids: [Number(teacherId)] };

  const data = await executeGraphQL(mutation, {
    parentItemId,
    itemName: name,
    columnValues: JSON.stringify(columnValues),
  });
  return data?.create_subitem?.id;
}

export async function uploadProjectSubitemSignature(subitemId, fileBuffer, fileName, mimeType) {
  return uploadFileToColumn(subitemId, PROJECT_SUBITEM_SIGNATURE_COLUMN_ID, fileBuffer, fileName, mimeType);
}

// --- Lesson / report items -----------------------------------------------

function formatDateColumn(dateString) {
  return { date: dateString };
}

export async function createLessonItem({ studentId, studentName, teacherName, date, startHour, startMinute, endHour, endMinute }) {
  const mutation = `
    mutation CreateLesson($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;

  const columnValues = {
    date_mm5y2ekf: formatDateColumn(date), // תאריך שיעור
    hour_mm5y68a6: { hour: startHour, minute: startMinute }, // שעת התחלה
    hour_mm5ye9ek: { hour: endHour, minute: endMinute }, // שעת סיום
    text_mm5yfq79: teacherName, // שם המורה
  };
  if (studentId) columnValues[LESSON_CONTACT_RELATION_COLUMN_ID] = { item_ids: [Number(studentId)] };

  const data = await executeGraphQL(mutation, {
    boardId: LESSON_BOARD_ID,
    itemName: studentName,
    columnValues: JSON.stringify(columnValues),
  });

  return data?.create_item?.id;
}

export async function createReportItem({ studentName, teacherName, teacherId, studentId, totalHours }) {
  const mutation = `
    mutation CreateReport($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;

  const today = new Date();
  const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const columnValues = {
    text_mm4s2er2: studentName, // שם התלמיד
    numeric_mm4sy518: totalHours, // סה"כ שעות
    date_mm5yatqr: { date: todayFormatted }, // תאריך
  };
  if (teacherId) columnValues.board_relation_mm4sv07c = { item_ids: [Number(teacherId)] }; // מורה
  if (studentId) columnValues[REPORT_CONTACT_RELATION_COLUMN_ID] = { item_ids: [Number(studentId)] };

  const data = await executeGraphQL(mutation, {
    boardId: REPORT_BOARD_ID,
    groupId: 'group_mm4sg9rh',
    itemName: teacherName,
    columnValues: JSON.stringify(columnValues),
  });

  return data?.create_item?.id;
}

// --- Reporting / dashboards ------------------------------------------------

function parseJsonSafe(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toMinutes(hourValue) {
  if (!hourValue || hourValue.hour === undefined || hourValue.hour === null) return null;
  return Number(hourValue.hour) * 60 + Number(hourValue.minute || 0);
}

// Reads every item on a board, following monday's cursor pagination.
async function fetchAllItems(boardId, itemFields) {
  const items = [];
  let page = await executeGraphQL(`
    query {
      boards(ids: [${boardId}]) {
        items_page(limit: 500) {
          cursor
          items { ${itemFields} }
        }
      }
    }
  `);
  let result = page?.boards?.[0]?.items_page;
  items.push(...(result?.items || []));

  while (result?.cursor) {
    page = await executeGraphQL(`
      query ($cursor: String!) {
        next_items_page(limit: 500, cursor: $cursor) {
          cursor
          items { ${itemFields} }
        }
      }
    `, { cursor: result.cursor });
    result = page?.next_items_page;
    items.push(...(result?.items || []));
  }
  return items;
}

const LESSONS_CACHE_TTL_MS = 30 * 1000;
let lessonsCache = { at: 0, lessons: null };

// All reported lessons from the lesson board, normalised. Cached briefly so
// opening a dashboard and exporting a report doesn't re-read the whole board
// twice. Teachers are identified by the name text on each lesson (the lesson
// board has no teacher relation column).
export async function fetchAllLessons({ fresh = false } = {}) {
  if (!fresh && lessonsCache.lessons && Date.now() - lessonsCache.at < LESSONS_CACHE_TTL_MS) {
    return lessonsCache.lessons;
  }

  const items = await fetchAllItems(
    LESSON_BOARD_ID,
    `id name column_values(ids: ["date_mm5y2ekf", "hour_mm5y68a6", "hour_mm5ye9ek", "text_mm5yfq79", "signatureiwrnxr4b", "${LESSON_CONTACT_RELATION_COLUMN_ID}"]) {
      id text value
      ... on BoardRelationValue { linked_item_ids }
    }`
  );

  const lessons = items
    .map((item) => {
      const col = (id) => item.column_values?.find((c) => c.id === id);
      const date = col('date_mm5y2ekf')?.text || '';
      const start = toMinutes(parseJsonSafe(col('hour_mm5y68a6')?.value));
      const end = toMinutes(parseJsonSafe(col('hour_mm5ye9ek')?.value));
      const linkedIds = col(LESSON_CONTACT_RELATION_COLUMN_ID)?.linked_item_ids || [];
      const studentId = linkedIds[0] ? String(linkedIds[0]) : null;
      const studentName = (item.name || '').trim();
      return {
        id: item.id,
        date,
        month: date.slice(0, 7),
        startMinutes: start,
        endMinutes: end,
        minutes: start !== null && end !== null ? Math.max(0, end - start) : 0,
        teacherName: (col('text_mm5yfq79')?.text || '').trim(),
        studentId,
        studentName,
        // Students without a relation (older reports) are grouped by name.
        studentKey: studentId || `name:${studentName}`,
        signatureAssetId: parseJsonSafe(col('signatureiwrnxr4b')?.value)?.files?.[0]?.assetId || null,
      };
    })
    .filter((l) => l.date);

  // Older reports have no student relation. When the same student name also
  // appears on a linked report (with one unambiguous id), reuse that id so the
  // student isn't split into two entries in the dashboards.
  const idsByName = new Map();
  for (const l of lessons) {
    if (!l.studentId) continue;
    if (!idsByName.has(l.studentName)) idsByName.set(l.studentName, new Set());
    idsByName.get(l.studentName).add(l.studentId);
  }
  for (const l of lessons) {
    const ids = !l.studentId ? idsByName.get(l.studentName) : null;
    if (ids && ids.size === 1) {
      l.studentId = [...ids][0];
      l.studentKey = l.studentId;
    }
  }

  lessonsCache = { at: Date.now(), lessons };
  return lessons;
}

// Chooses which of several matching project items a student's lessons count
// against: the one that already has subitems, else the first.
function pickProjectItem(matches) {
  if (matches.length <= 1) return matches[0] || null;
  return matches.find((m) => (m.subitems || []).length > 0) || matches[0];
}

// Lessons/hours remaining in each student's active package, as computed by
// monday on the project board. Returns { [studentId]: number | null }.
export async function getRemainingLessonsByStudent(studentIds) {
  const ids = [...new Set(studentIds.filter(Boolean).map(String))];
  const result = {};
  if (!ids.length) return result;

  const dealsByStudent = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await executeGraphQL(`
      query ($ids: [ID!]!) {
        items(ids: $ids, limit: 100) {
          id
          column_values(ids: ["contact_deal"]) { ... on BoardRelationValue { linked_item_ids } }
        }
      }
    `, { ids: chunk });
    for (const item of data?.items || []) {
      // A student can be linked to several deals.
      const dealIds = (item.column_values?.[0]?.linked_item_ids || []).map(String);
      if (dealIds.length) dealsByStudent[item.id] = dealIds;
    }
  }

  const projectItems = await fetchAllItems(
    PROJECT_BOARD_ID,
    `id group { id } subitems { id }
     column_values(ids: ["board_relation_mm6ejnt5", "numeric_mm70649g"]) {
       id text
       ... on BoardRelationValue { linked_item_ids }
     }`
  );
  const active = projectItems.filter((item) => item.group?.id === PROJECT_ACTIVE_GROUP_ID);

  for (const studentId of ids) {
    const dealIds = dealsByStudent[studentId];
    result[studentId] = null;
    if (!dealIds) continue;
    const matches = active.filter((item) =>
      (item.column_values?.find((c) => c.id === 'board_relation_mm6ejnt5')?.linked_item_ids || []).map(String).some((id) => dealIds.includes(id))
    );
    const chosen = pickProjectItem(matches);
    if (!chosen) continue;
    const text = chosen.column_values?.find((c) => c.id === 'numeric_mm70649g')?.text;
    result[studentId] = text !== undefined && text !== null && text !== '' ? Number(text) : null;
  }
  return result;
}

export {
  TEACHER_BOARD_ID,
  CONTACT_BOARD_ID,
  LESSON_BOARD_ID,
  REPORT_BOARD_ID,
  PROJECT_BOARD_ID,
};
