/**
 * GoalForge — Business Rule Validation
 * Enforces all BRD validation rules from Section 2.1
 * 
 * Rules enforced:
 * 1. Total weightage across all goals must equal 100%
 * 2. Minimum weightage per individual goal: 10%
 * 3. Maximum number of goals per employee: 8
 */

/**
 * Validate a goal sheet before submission
 * @param {Array} goals - Array of goal objects
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateGoalSheet(goals) {
  const errors = [];

  // Rule: Maximum 8 goals per employee
  if (goals.length > 8) {
    errors.push(`Maximum 8 goals allowed. You have ${goals.length} goals.`);
  }

  if (goals.length === 0) {
    errors.push('At least one goal is required.');
    return { valid: false, errors };
  }

  // Rule: Minimum weightage per goal = 10%
  for (const goal of goals) {
    if (goal.weightage < 10) {
      errors.push(`Goal "${goal.title}" has weightage ${goal.weightage}%. Minimum is 10%.`);
    }
    if (!goal.title || goal.title.trim().length === 0) {
      errors.push('All goals must have a title.');
    }
    if (!goal.uom_type) {
      errors.push(`Goal "${goal.title}" must have a Unit of Measurement type.`);
    }
    // Validate target based on UoM type
    if (goal.uom_type === 'timeline') {
      if (!goal.target_date) {
        errors.push(`Goal "${goal.title}" (Timeline) requires a target date.`);
      }
    } else if (goal.uom_type === 'zero') {
      // Zero-based: no target needed, auto-set to 0
    } else {
      if (goal.target_value === null || goal.target_value === undefined || goal.target_value === '') {
        errors.push(`Goal "${goal.title}" requires a numeric target value.`);
      }
    }
  }

  // Rule: Total weightage must equal 100%
  const totalWeightage = goals.reduce((sum, g) => sum + Number(g.weightage || 0), 0);
  if (Math.abs(totalWeightage - 100) > 0.01) {
    errors.push(`Total weightage must equal 100%. Current total: ${totalWeightage}%.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single goal for inline editing by manager
 */
function validateGoalEdit(goal, allGoals) {
  const errors = [];

  if (goal.weightage < 10) {
    errors.push('Minimum weightage is 10%.');
  }

  if (goal.target_value !== undefined && goal.target_value !== null) {
    if (isNaN(Number(goal.target_value))) {
      errors.push('Target value must be numeric.');
    }
  }

  // Re-check total weightage with the edit applied
  const otherGoals = allGoals.filter(g => g.id !== goal.id);
  const totalWeightage = otherGoals.reduce((sum, g) => sum + Number(g.weightage || 0), 0) + Number(goal.weightage || 0);

  if (totalWeightage > 100) {
    errors.push(`Total weightage would be ${totalWeightage}%. Maximum is 100%.`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateGoalSheet, validateGoalEdit };
