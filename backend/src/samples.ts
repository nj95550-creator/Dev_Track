/**
 * Seed editable example projects and connected learning goals for an account.
 * The account lock makes the empty-workspace check and inserts one transaction,
 * so simultaneous requests cannot append duplicate example sets.
 */
import { transaction } from './database';
/**
 * Add one example set only when the locked account has no projects. Goal
 * project links use the actual inserted IDs, preserving each account's ownership.
 */
export async function addSamples(userId: number) {
  return transaction(async (query) => {
    // Lock the user row to prevent two simultaneous seed requests duplicating data.
    await query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if ((await query('SELECT id FROM projects WHERE user_id=$1 LIMIT 1', [userId])).rows.length)
      return false;
    const projects = [
      [
        'Developer portfolio',
        'A place for the work I’m proud of. Building a fast, accessible portfolio with case studies and a little personality.',
        'in_progress',
        'high',
        75,
        'React, TypeScript, CSS',
        null,
        null,
        12,
      ],
      [
        'DevTrack',
        'My personal command center for projects, learning goals, and the progress in between.',
        'in_progress',
        'high',
        60,
        'React, Node.js, PostgreSQL',
        null,
        null,
        21,
      ],
      [
        'Weather dashboard',
        'A responsive weather experience with location search, forecasts, and saved cities.',
        'completed',
        'medium',
        100,
        'JavaScript, REST API',
        null,
        null,
        -2,
      ],
      [
        'REST API playground',
        'Practice API design, authentication, and useful documentation in one focused project.',
        'planned',
        'medium',
        0,
        'Node.js, TypeScript',
        null,
        null,
        30,
      ],
      [
        'Design system',
        'A small library of reusable components with consistent spacing, color, and keyboard support.',
        'in_progress',
        'low',
        35,
        'React, CSS',
        null,
        null,
        45,
      ],
      [
        'CLI task manager',
        'A lightweight command-line tool to capture ideas and keep daily tasks organized.',
        'completed',
        'low',
        100,
        'Python',
        null,
        null,
        -10,
      ],
    ];
    const ids: number[] = [];
    for (const p of projects) {
      const result = await query(
        `INSERT INTO projects(user_id,title,description,status,priority,progress,technologies,repository_url,live_url,start_date,target_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_DATE-14,CURRENT_DATE+$10::integer) RETURNING id`,
        [userId, ...p],
      );
      await query(
        "UPDATE projects SET created_at=CURRENT_TIMESTAMP - INTERVAL '30 days', updated_at=CURRENT_TIMESTAMP - ($2 * INTERVAL '1 day') WHERE id=$1",
        [result.rows[0].id, ids.length],
      );
      ids.push(result.rows[0].id);
    }
    const goals = [
      [
        'Get comfortable with TypeScript',
        'Use generics and clear types in a real project.',
        'in_progress',
        ids[0],
        7,
      ],
      [
        'Build secure authentication',
        'Understand sessions, cookies, and ownership checks.',
        'in_progress',
        ids[1],
        14,
      ],
      [
        'Learn CSS Grid',
        'Create responsive layouts without extra breakpoints.',
        'completed',
        ids[2],
        -3,
      ],
      [
        'Write API integration tests',
        'Test the behavior that matters, including error cases.',
        'planned',
        ids[3],
        21,
      ],
    ];
    for (const g of goals)
      await query(
        'INSERT INTO learning_goals(user_id,title,description,status,project_id,target_date) VALUES($1,$2,$3,$4,$5,CURRENT_DATE+$6::integer)',
        [userId, ...g],
      );
    return true;
  });
}
