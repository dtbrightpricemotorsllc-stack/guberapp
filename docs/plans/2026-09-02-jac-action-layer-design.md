# JAC Action Layer and Workflow Continuity

## Goal

Connect JAC's restored August 23 voice experience to real GUBER workflows without
changing its ElevenLabs ConvAI transport, managed OpenAI reasoning, voice,
characters, entrance, layout, or conversational feel.

JAC must never claim that an account, search, listing, alert, booking, payment,
or other action succeeded unless the corresponding GUBER backend confirms it.

## Scope

The first implementation connects these workflows, in order:

1. Secure guest registration.
2. Authenticated personal Command Center routing.
3. Real nearby-work search.

Existing manual navigation remains available. Unsupported actions return an
explicit "I can guide or prepare this, but I cannot complete it yet" state.

## Architecture

JAC emits structured action intents through the existing action gateway. The
server validates the intent, authentication, permissions, and required fields
before invoking an existing GUBER workflow. The gateway returns a typed,
backend-derived state:

- `prepared`
- `needs_authentication`
- `needs_confirmation`
- `executing`
- `succeeded`
- `failed`
- `unsupported`

Only `succeeded` permits completion language. Search summaries and counts are
derived exclusively from returned records.

The action gateway is the only path from JAC to a GUBER action. The restored
voice transport remains unchanged and receives action results through its
existing conversation surface.

## Secure guest registration

JAC may collect only non-sensitive conversational details such as account type,
work interests, approximate area, and the user's original goal. Passwords and
verification codes are never requested or accepted through voice.

The server stores a pending registration workflow against the guest JAC session.
On the web and PWA, JAC opens the existing secure signup component in-scene. A
native surface uses the same component as a full-screen secure sheet.

Voice pauses while password or verification fields are active. After the
existing authentication flow confirms the account:

1. Transfer the guest session and pending workflow.
2. Verify the authenticated user.
3. Resolve the account-appropriate Command Center route.
4. Navigate only after the transfer succeeds.
5. Restore the transcript, original intent, safe fields, and workflow step.
6. Resume JAC at the next unfinished step.

## Nearby-work search

The first read-only action uses the existing authenticated GUBER job data
source. It accepts explicit search criteria and returns real records, exact
counts, safe location data, and existing detail/navigation routes.

The UI renders those records as result cards inside the JAC conversation. Empty,
permission, and backend errors are visible and truthful. JAC cannot invent a
result or count.

## Consequential actions

Posting, booking, accepting, paying, publishing, or changing account data never
executes directly from a conversational claim. The server creates an approval
card containing the action summary, collected fields, destination, and price or
payment details when applicable. Only an explicit user confirmation invokes the
backend mutation.

The final user-facing message is generated from the mutation response, not from
the original intent.

## Continuity

Workflow state is persisted independently of the voice socket and includes:

- Transcript and guest/user session identity.
- Original intent and safe collected fields.
- Pending action and approval state.
- Current workflow step.
- References to returned records.

A disconnect or reconnect is a transport event, not a workflow reset. Text
switching, secure signup, verification, and Command Center navigation all read
and update the same state. Reconnected voice receives a server-generated
summary and continues the existing workflow instead of restarting it.

## Error handling

Backend failures, authentication gaps, missing fields, unsupported capabilities,
and empty results each have separate visible states. No failure path uses
success language. No fallback provider or synthetic data is introduced.

## Verification

Add tests for:

- Truthful action states and rejection of unsupported success claims.
- No spoken password or verification-code collection.
- Secure in-scene signup presentation and voice pause.
- Guest session transfer and account-appropriate Command Center routing.
- Preservation across disconnect, reconnect, text switching, signup, and
  authenticated navigation.
- Real nearby-work result cards, exact counts, empty results, and backend errors.
- Approval required before consequential mutations.
- Existing August 23 ConvAI voice regressions remaining green.