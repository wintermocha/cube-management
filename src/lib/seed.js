const now = '2026-07-03T00:00:00.000Z';
export function seedData() {
  return {
    household: { id: 'home', name: '우리집', created_at: now },
    members: [
      { household_id: 'home', email: 'caregiver-a@example.com', role: 'owner', created_at: now },
      { household_id: 'home', email: 'caregiver-b@example.com', role: 'caregiver', created_at: now },
    ],
    childProfile: { id: 'child-1', household_id: 'home', display_name: '아기', birth_date: '', notes: '', created_at: now, updated_at: now },
    ingredients: [
      { id: 'ing-beef', household_id: 'home', name: '소고기', category: '단백질', status: 'tolerated', notes: '', created_at: now, updated_at: now },
      { id: 'ing-broccoli', household_id: 'home', name: '브로콜리', category: '채소', status: 'testing', notes: '', created_at: now, updated_at: now },
      { id: 'ing-rice', household_id: 'home', name: '쌀미음', category: '곡류', status: 'tolerated', notes: '', created_at: now, updated_at: now },
    ],
    cubeLots: [
      { id: 'lot-beef-1', household_id: 'home', ingredient_id: 'ing-beef', made_at: '2026-07-01', expires_at: '2026-07-21', initial_count: 5, remaining_count: 5, grams_per_cube: 15, storage_location: '냉동실 A', created_at: now, updated_at: now },
      { id: 'lot-broccoli-1', household_id: 'home', ingredient_id: 'ing-broccoli', made_at: '2026-07-02', expires_at: '2026-07-22', initial_count: 3, remaining_count: 3, grams_per_cube: 15, storage_location: '냉동실 A', created_at: now, updated_at: now },
      { id: 'lot-rice-1', household_id: 'home', ingredient_id: 'ing-rice', made_at: '2026-06-30', expires_at: '2026-07-20', initial_count: 12, remaining_count: 12, grams_per_cube: 20, storage_location: '냉동실 B', created_at: now, updated_at: now },
    ],
    combinations: [{ id: 'combo-beef-broccoli', household_id: 'home', name: '소고기 브로콜리 죽', stage: '중기', texture: '죽', notes: '', created_at: now, updated_at: now }],
    combinationItems: [
      { combination_id: 'combo-beef-broccoli', ingredient_id: 'ing-beef', cube_count: 1 },
      { combination_id: 'combo-beef-broccoli', ingredient_id: 'ing-broccoli', cube_count: 1 },
      { combination_id: 'combo-beef-broccoli', ingredient_id: 'ing-rice', cube_count: 2 },
    ],
    mealPlanSlots: [
      { id: 'slot-1', household_id: 'home', date: '2026-07-03', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', ingredient_id: null, cube_count: null, status: 'planned', created_at: now, updated_at: now },
      { id: 'slot-2', household_id: 'home', date: '2026-07-04', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', ingredient_id: null, cube_count: null, status: 'planned', created_at: now, updated_at: now },
      { id: 'slot-3', household_id: 'home', date: '2026-07-05', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', ingredient_id: null, cube_count: null, status: 'planned', created_at: now, updated_at: now },
      { id: 'slot-4', household_id: 'home', date: '2026-07-06', meal_type: '점심', target_type: 'combination', combination_id: 'combo-beef-broccoli', ingredient_id: null, cube_count: null, status: 'planned', created_at: now, updated_at: now },
    ],
    events: [], aiCommands: [], approvalRequests: []
  };
}
