/**
 * BlackTrace Workflow Logger
 * Clean, structured logs for demo purposes
 */

type WorkflowType = 'AUTH' | 'ORDER' | 'PROPOSAL' | 'SETTLEMENT';

const COLORS = {
  AUTH: '#22c55e',      // Green
  ORDER: '#3b82f6',     // Blue
  PROPOSAL: '#a855f7',  // Purple
  SETTLEMENT: '#f59e0b', // Amber
};

const ICONS = {
  AUTH: '👤',
  ORDER: '📋',
  PROPOSAL: '🤝',
  SETTLEMENT: '🔐',
};

/**
 * Log a workflow state transition
 */
export function logWorkflow(
  workflow: WorkflowType,
  action: string,
  details?: Record<string, any>
) {
  const icon = ICONS[workflow];
  const color = COLORS[workflow];

  console.log(
    `%c${icon} [${workflow}] ${action}`,
    `color: ${color}; font-weight: bold; font-size: 12px;`
  );

  if (details && Object.keys(details).length > 0) {
    console.log(
      `%c   └─ ${JSON.stringify(details, null, 0)}`,
      `color: ${color}; font-size: 11px;`
    );
  }
}

/**
 * Log workflow state change
 */
export function logStateChange(
  workflow: WorkflowType,
  fromState: string | undefined,
  toState: string,
  entityId?: string
) {
  const icon = ICONS[workflow];
  const color = COLORS[workflow];
  const arrow = fromState ? `${fromState} → ${toState}` : toState;

  console.log(
    `%c${icon} [${workflow}] State: ${arrow}`,
    `color: ${color}; font-weight: bold; font-size: 12px;`
  );

  if (entityId) {
    console.log(
      `%c   └─ ID: ${entityId.slice(0, 40)}${entityId.length > 40 ? '...' : ''}`,
      `color: ${color}; font-size: 11px;`
    );
  }
}

/**
 * Log workflow success
 */
export function logSuccess(
  workflow: WorkflowType,
  message: string,
  details?: Record<string, any>
) {
  const icon = ICONS[workflow];

  console.log(
    `%c${icon} [${workflow}] ✅ ${message}`,
    `color: #22c55e; font-weight: bold; font-size: 12px;`
  );

  if (details && Object.keys(details).length > 0) {
    console.log(
      `%c   └─ ${JSON.stringify(details, null, 0)}`,
      `color: #22c55e; font-size: 11px;`
    );
  }
}

/**
 * Log workflow error
 */
export function logError(
  workflow: WorkflowType,
  message: string,
  error?: any
) {
  const icon = ICONS[workflow];

  console.log(
    `%c${icon} [${workflow}] ❌ ${message}`,
    `color: #ef4444; font-weight: bold; font-size: 12px;`
  );

  if (error) {
    console.log(
      `%c   └─ ${error.message || error}`,
      `color: #ef4444; font-size: 11px;`
    );
  }
}

/**
 * Log settlement-specific workflow with visual status
 */
export function logSettlement(
  action: string,
  status: string | undefined,
  details?: Record<string, any>
) {
  const statusMap: Record<string, string> = {
    'ready': '⏳ Ready to Lock',
    'alice_locked': '🔒 Alice Locked ZEC',
    'bob_locked': '🔒 Bob Locked STRK',
    'both_locked': '🔐 Both Parties Locked',
    'strk_claimed': '💰 Alice Claimed STRK',
    'alice_claimed': '💰 Alice Claimed STRK',
    'claiming': '⏳ Claiming in Progress',
    'complete': '✅ Settlement Complete',
  };

  const statusDisplay = status ? (statusMap[status] || status) : 'Unknown';

  console.log(
    `%c🔐 [SETTLEMENT] ${action}`,
    `color: #f59e0b; font-weight: bold; font-size: 12px;`
  );
  console.log(
    `%c   └─ Status: ${statusDisplay}`,
    `color: #f59e0b; font-size: 11px;`
  );

  if (details && Object.keys(details).length > 0) {
    Object.entries(details).forEach(([key, value]) => {
      const displayValue = typeof value === 'string' && value.length > 50
        ? value.slice(0, 50) + '...'
        : value;
      console.log(
        `%c   └─ ${key}: ${displayValue}`,
        `color: #f59e0b; font-size: 11px;`
      );
    });
  }
}

/**
 * Log a separator for visual clarity
 */
export function logSeparator(workflow?: WorkflowType) {
  const color = workflow ? COLORS[workflow] : '#888';
  console.log(
    `%c${'─'.repeat(50)}`,
    `color: ${color}; font-size: 10px;`
  );
}

/**
 * Log the start of a new workflow
 */
export function logWorkflowStart(workflow: WorkflowType, title: string) {
  const icon = ICONS[workflow];
  const color = COLORS[workflow];

  console.log('');
  console.log(
    `%c╔${'═'.repeat(48)}╗`,
    `color: ${color}; font-size: 11px;`
  );
  console.log(
    `%c║ ${icon} ${title.padEnd(46)}║`,
    `color: ${color}; font-weight: bold; font-size: 12px;`
  );
  console.log(
    `%c╚${'═'.repeat(48)}╝`,
    `color: ${color}; font-size: 11px;`
  );
}
