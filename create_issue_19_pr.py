#!/usr/bin/env python3
"""
Script to create GitHub PR for Issue #19: Concept brief and hydration UI components.
Uses direct GitHub API call.
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from github import Github
except ImportError:
    print("Error: PyGithub not installed. Install with: pip install PyGithub")
    sys.exit(1)

def get_github_client():
    token = os.getenv("PRODUCT_GITHUB_TOKEN") or os.getenv("GITHUB_TOKEN")
    if not token:
        raise ValueError("PRODUCT_GITHUB_TOKEN or GITHUB_TOKEN not found in environment variables")
    return Github(token)

def create_pull_request(
    repo_name: str,
    title: str,
    body: str,
    head: str,
    base: str = "staging",
    labels: list = None
):
    """
    Creates a GitHub pull request.
    
    Args:
        repo_name: Repository name (formatted as 'owner/repo')
        title: The title of the PR
        body: The content/description of the PR
        head: The branch to merge from
        base: The branch to merge into (default: staging)
        labels: List of label names to apply
    """
    try:
        g = get_github_client()
        repo = g.get_repo(repo_name)
        
        pr = repo.create_pull(
            title=title,
            body=body,
            head=head,
            base=base
        )
        
        if labels:
            # Get label objects
            label_objects = []
            for label_name in labels:
                try:
                    label = repo.get_label(label_name)
                    label_objects.append(label)
                except Exception as e:
                    print(f"Warning: Could not find label '{label_name}': {e}")
            
            if label_objects:
                pr.add_to_labels(*label_objects)
        
        return f"Successfully created PR #{pr.number}: {pr.html_url}"
        
    except Exception as e:
        return f"Error creating GitHub PR: {str(e)}"

def main():
    repo_name = "bcolemanau/agent-chat-ui"
    head = "feature/issue-19-hydration-preview-view"
    base = "staging"
    
    title = "feat(issue-19): Concept brief and hydration diff views with horizontal layout"
    
    body = """## Issue #19: Concept Brief and Hydration UI Components

This PR adds UI components for Issue #19 concept agent work.

### Features
- **Concept Brief Diff View**: Server-backed diff view for comparing concept options
- **Hydration Diff View**: Diff view component for hydration proposals
- **Unified Approvals System**: Centralized approval/reject/edit UI for all proposal types
- **Horizontal Layout**: Chat panel on right with 25% min, 75% max constraints
- **Supporting Components**: Progress, tabs, and diff renderer utilities

### Layout Improvements
- Converted chat panel from vertical (bottom) to horizontal (right) layout
- Percentage-based sizing (default 40% width)
- 25% minimum and 75% maximum constraints for both panels
- Resizable divider with proper constraints

### Components Added

**New Files:**
- `src/app/workbench/concept-brief/page.tsx` - Concept brief workbench page
- `src/components/workbench/concept-brief-diff-view.tsx` - Concept brief option comparison
- `src/app/workbench/hydration/page.tsx` - Hydration workbench page
- `src/components/workbench/hydration-diff-view.tsx` - Hydration proposal diff view
- `src/app/workbench/decisions/page.tsx` - Unified decisions page
- `src/components/workbench/approval-card.tsx` - Approval/reject/edit card component
- `src/components/workbench/hooks/use-unified-approvals.ts` - Unified approvals hook
- `src/components/workbench/hooks/use-approval-count.ts` - Approval count hook
- `src/lib/diff-types.ts` - Standardized diff interface types
- `src/components/workbench/__tests__/hydration-diff-view.test.tsx` - Tests
- `src/components/workbench/diff-renderers/` - Diff rendering utilities
- `src/components/ui/progress.tsx` - Progress UI component
- `src/components/ui/tabs.tsx` - Tabs UI component
- `jest.config.cjs` - Testing configuration

**Modified Files:**
- `src/components/workbench/shell.tsx` - Horizontal layout with percentage-based sizing

### Related
- Issue #19: Concept agent implementation
- Part of Issue #19 Phase 1: Template-Driven Agent Foundation"""
    
    labels = []
    
    result = create_pull_request(
        repo_name=repo_name,
        title=title,
        body=body,
        head=head,
        base=base,
        labels=labels
    )
    
    print(result)
    return result

if __name__ == "__main__":
    main()
