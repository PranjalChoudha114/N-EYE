import {
  type ActionProposal,
  type SafeContext,
  createActionId,
} from '@n-eye/protocol';

export class DeterministicPlanner {
  private stepCount = 0;

  public proposeAction(context: SafeContext): ActionProposal {
    this.stepCount += 1;

    // 1. If goal involves entering email and token is available
    const emailToken = context.availableTokens.find((t) => t.privacyClass === 'PII_EMAIL' || t.tokenSymbol.includes('EMAIL'));
    const emailElement = context.safeElements.find((e) =>
      (e.inputType === 'email' || (e.role === 'textbox' && e.safeLabel.toLowerCase().includes('email'))) && e.isEnabled
    );

    if (emailToken && emailElement && !context.priorOutcome) {
      return {
        actionId: createActionId(`act_${Date.now()}_${this.stepCount}`),
        type: 'TYPE_TOKEN',
        targetId: emailElement.id,
        tokenId: emailToken.tokenId,
        tokenSymbol: emailToken.tokenSymbol,
        reasoning: `Goal requests user email. Target element ${emailElement.id} matches email input. Proposing scoped token insertion.`,
        expectedOutcome: `Target ${emailElement.id} will be populated with local token ${emailToken.tokenSymbol}.`,
        riskLevel: 'MEDIUM',
      };
    }

    // 2. Submit / Continue button
    const submitBtn = context.safeElements.find((e) =>
      (e.role === 'button' || e.inputType === 'submit') &&
      (e.safeLabel.toLowerCase().includes('submit') || e.safeLabel.toLowerCase().includes('continue') || e.safeLabel.toLowerCase().includes('login') || e.safeLabel.toLowerCase().includes('sign in')) &&
      e.isEnabled
    );

    if (submitBtn) {
      return {
        actionId: createActionId(`act_${Date.now()}_${this.stepCount}`),
        type: 'CLICK',
        targetId: submitBtn.id,
        reasoning: `Found action button "${submitBtn.safeLabel}". Proposing click to advance workflow.`,
        expectedOutcome: 'Form will be submitted and state will transition.',
        riskLevel: submitBtn.safeLabel.toLowerCase().includes('submit') || submitBtn.safeLabel.toLowerCase().includes('login') ? 'HIGH' : 'LOW',
      };
    }

    // 3. Fallback: Complete task
    return {
      actionId: createActionId(`act_${Date.now()}_${this.stepCount}`),
      type: 'COMPLETE',
      reasoning: 'All available goal actions completed on current page state.',
      expectedOutcome: 'Task marked complete.',
      riskLevel: 'LOW',
    };
  }

  public reset(): void {
    this.stepCount = 0;
  }
}
