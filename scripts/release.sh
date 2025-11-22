#!/bin/bash
# Release automation script for Mnemora
# Creates git tags, bumps version, and optionally creates GitHub releases

set -e

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Function to get current version from package.json
get_current_version() {
    node -p "require('./package.json').version"
}

# Function to bump version
bump_version() {
    local version_type=$1
    local current_version=$(get_current_version)
    
    # Parse version components
    IFS='.' read -r major minor patch <<< "$current_version"
    
    case "$version_type" in
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        patch)
            patch=$((patch + 1))
            ;;
        *)
            print_error "Invalid version type: $version_type. Use major, minor, or patch."
            exit 1
            ;;
    esac
    
    echo "$major.$minor.$patch"
}

# Function to validate version format
validate_version() {
    local version=$1
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_error "Invalid version format: $version. Expected format: X.Y.Z"
        exit 1
    fi
}

# Function to check if git working directory is clean
check_git_clean() {
    if ! git diff-index --quiet HEAD --; then
        print_error "Working directory is not clean. Please commit or stash changes first."
        exit 1
    fi
}

# Function to get commits since last tag
get_commits() {
    local previous_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    
    if [ -z "$previous_tag" ]; then
        # First release - get all commits
        git log --pretty=format:"%h|%s" --reverse
    else
        # Get commits since last tag (exclude version bump commits)
        git log --pretty=format:"%h|%s" "${previous_tag}..HEAD" | grep -v "chore: bump version"
    fi
}

# Function to categorize commit message
categorize_commit() {
    local commit_message=$1
    
    # Check for conventional commit prefixes
    if [[ "$commit_message" =~ ^feat(\(.+\))?: ]]; then
        echo "features"
    elif [[ "$commit_message" =~ ^fix(\(.+\))?: ]]; then
        echo "fixes"
    elif [[ "$commit_message" =~ ^refactor(\(.+\))?: ]]; then
        echo "refactor"
    elif [[ "$commit_message" =~ ^perf(\(.+\))?: ]]; then
        echo "performance"
    elif [[ "$commit_message" =~ ^docs(\(.+\))?: ]]; then
        echo "documentation"
    elif [[ "$commit_message" =~ ^test(\(.+\))?: ]]; then
        echo "tests"
    elif [[ "$commit_message" =~ ^chore(\(.+\))?: ]]; then
        echo "chores"
    elif [[ "$commit_message" =~ ^build(\(.+\))?: ]]; then
        echo "build"
    else
        echo "other"
    fi
}

# Function to format commit message (remove prefix, capitalize)
format_commit_message() {
    local commit_message=$1
    
    # Remove conventional commit prefix (e.g., "feat: " or "feat(something): ")
    commit_message=$(echo "$commit_message" | sed -E 's/^[a-z]+(\([^)]+\))?: //')
    
    # Capitalize first letter
    echo "$commit_message" | sed 's/^./\U&/'
}

# Function to categorize commit message (returns category name)
get_commit_category() {
    local message=$1
    case "$message" in
        feat:*) echo "features" ;;
        fix:*) echo "fixes" ;;
        refactor:*) echo "refactor" ;;
        perf:*) echo "performance" ;;
        docs:*) echo "documentation" ;;
        test:*) echo "tests" ;;
        build:*) echo "build" ;;
        chore:*) echo "chores" ;;
        *) echo "other" ;;
    esac
}

# Function to format commit message (remove prefix, capitalize)
format_commit_for_notes() {
    local message=$1
    # Remove conventional commit prefix (e.g., "feat: " or "feat(something): ")
    message=$(echo "$message" | sed -E 's/^[a-z]+(\([^)]+\))?: //')
    # Capitalize first letter
    echo "$message" | sed 's/^./\U&/'
}

# Function to generate structured release notes (using Node.js for compatibility)
generate_release_notes() {
    local version=$1
    local date=$2
    
    local previous_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
    local commits=$(get_commits)
    
    # Use Node.js to generate structured release notes (better compatibility)
    echo "$commits" | node -e "
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });
        
        const categories = {};
        const categoryLabels = {
            features: '✨ Features',
            fixes: '🐛 Bug Fixes',
            refactor: '♻️  Refactoring',
            performance: '⚡ Performance',
            documentation: '📝 Documentation',
            tests: '🧪 Tests',
            build: '🔨 Build',
            chores: '🔧 Chores',
            other: '📦 Other Changes'
        };
        
        function categorizeCommit(message) {
            if (message.match(/^feat(\(.+\))?:/)) return 'features';
            if (message.match(/^fix(\(.+\))?:/)) return 'fixes';
            if (message.match(/^refactor(\(.+\))?:/)) return 'refactor';
            if (message.match(/^perf(\(.+\))?:/)) return 'performance';
            if (message.match(/^docs(\(.+\))?:/)) return 'documentation';
            if (message.match(/^test(\(.+\))?:/)) return 'tests';
            if (message.match(/^build(\(.+\))?:/)) return 'build';
            if (message.match(/^chore(\(.+\))?:/)) return 'chores';
            return 'other';
        }
        
        function formatCommitMessage(message) {
            // Remove conventional commit prefix
            message = message.replace(/^[a-z]+(\([^)]+\))?: /, '');
            // Capitalize first letter
            return message.charAt(0).toUpperCase() + message.slice(1);
        }
        
        rl.on('line', (line) => {
            if (!line.trim()) return;
            
            const parts = line.split('|');
            if (parts.length !== 2) return;
            
            const [hash, message] = parts;
            if (!hash || !message) return;
            
            const category = categorizeCommit(message);
            const formatted = formatCommitMessage(message);
            
            if (!categories[category]) {
                categories[category] = [];
            }
            
            categories[category].push(\`- \${formatted} (\${hash})\`);
        });
        
        rl.on('close', () => {
            let notes = '## What\\'s Changed\\n\\n';
            let hasChanges = false;
            
            const categoryOrder = ['features', 'fixes', 'refactor', 'performance', 'documentation', 'tests', 'build', 'chores', 'other'];
            
            for (const category of categoryOrder) {
                if (categories[category] && categories[category].length > 0) {
                    hasChanges = true;
                    notes += \`### \${categoryLabels[category]}\\n\\n\`;
                    notes += categories[category].join('\\n') + '\\n\\n';
                }
            }
            
            if (!hasChanges) {
                notes += 'No significant changes in this release.\\n\\n';
            }
            
            const prevTag = '$previous_tag';
            if (prevTag) {
                notes += \`**Full Changelog**: \${prevTag}...v$version\`;
            } else {
                notes += \`**Full Changelog**: v$version\`;
            }
            
            process.stdout.write(notes);
        });
    "
}

# Function to update CHANGELOG.md
update_changelog() {
    local version=$1
    local release_notes=$2
    local changelog_file="CHANGELOG.md"
    
    local changelog_header="## [${version}] - $(date +%Y-%m-%d)"
    
    # Use a temporary file to pass release notes to Node.js (avoids escaping issues)
    local temp_notes_file=$(mktemp)
    echo "$release_notes" > "$temp_notes_file"
    
    # Use Node.js for more reliable file manipulation
    node -e "
        const fs = require('fs');
        const path = '$changelog_file';
        const notesPath = '$temp_notes_file';
        const header = '$changelog_header';
        
        const notes = fs.readFileSync(notesPath, 'utf8');
        const newEntry = header + '\\n\\n' + notes.trim() + '\\n';
        
        if (!fs.existsSync(path)) {
            // Create new CHANGELOG.md
            const content = \`# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial changelog

---

\${newEntry}\`;
            fs.writeFileSync(path, content, 'utf8');
        } else {
            // Update existing CHANGELOG.md
            const existing = fs.readFileSync(path, 'utf8');
            const lines = existing.split('\\n');
            const newLines = [];
            let foundUnreleased = false;
            let inserted = false;
            let i = 0;
            
            // Find and copy lines until we reach the Unreleased section
            for (i = 0; i < lines.length; i++) {
                const line = lines[i];
                newLines.push(line);
                
                if (line.match(/^## \\[Unreleased\\]/)) {
                    foundUnreleased = true;
                    break;
                }
            }
            
            if (foundUnreleased) {
                // Continue through Unreleased section until we find a version entry
                i++;
                while (i < lines.length) {
                    const line = lines[i];
                    
                    // Check if we hit the next version entry (format: ## [X.Y.Z])
                    if (line.match(/^## \\[[0-9]+\\.[0-9]+\\.[0-9]+\\]/)) {
                        // Insert new version before this one
                        newLines.push('');
                        newLines.push('---');
                        newLines.push(...newEntry.split('\\n'));
                        inserted = true;
                        break;
                    }
                    
                    // Check if we hit a separator (---)
                    if (line.match(/^---/)) {
                        // Insert new version before separator
                        newLines.push('');
                        newLines.push('---');
                        newLines.push(...newEntry.split('\\n'));
                        inserted = true;
                        break;
                    }
                    
                    newLines.push(line);
                    i++;
                }
                
                // Copy remaining lines if any
                if (i < lines.length) {
                    for (let j = i; j < lines.length; j++) {
                        newLines.push(lines[j]);
                    }
                } else if (!inserted) {
                    // Reached end without finding a version, append
                    newLines.push('');
                    newLines.push('---');
                    newLines.push(...newEntry.split('\\n'));
                    inserted = true;
                }
            } else {
                // No Unreleased section found, prepend it
                const headerLines = [
                    '# Changelog',
                    '',
                    'All notable changes to this project will be documented in this file.',
                    '',
                    'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),',
                    'and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
                    '',
                    '## [Unreleased]',
                    '',
                    '### Added',
                    '- Initial changelog',
                    '',
                    '---',
                    '',
                    ...newEntry.split('\\n'),
                    ''
                ];
                const allLines = headerLines.concat(newLines);
                fs.writeFileSync(path, allLines.join('\\n'), 'utf8');
                fs.unlinkSync(notesPath);
            }
            
            fs.writeFileSync(path, newLines.join('\\n'), 'utf8');
        }
        
        fs.unlinkSync(notesPath);
    " || {
        print_error "Failed to update CHANGELOG.md"
        rm -f "$temp_notes_file"
        return 1
    }
    
    rm -f "$temp_notes_file"
    
    print_success "Updated $changelog_file"
    return 0
}

# Function to get release notes from git commits (backwards compatibility)
get_release_notes() {
    local current_tag=$1
    local version="${current_tag#v}"
    generate_release_notes "$version" "$(date +%Y-%m-%d)"
}

# Function to create GitHub release
create_github_release() {
    local tag=$1
    local release_notes=$2
    
    if ! command -v gh &> /dev/null; then
        print_info "GitHub CLI (gh) not found. Skipping GitHub release creation."
        print_info "Install with: brew install gh"
        print_info "You can create the release manually at: https://github.com/$(git config --get remote.origin.url | sed -E 's/.*github.com[:/](.*)\.git/\1/')/releases/new"
        return 0
    fi
    
    # Check if gh is authenticated
    if ! gh auth status &>/dev/null; then
        print_info "GitHub CLI not authenticated. Skipping GitHub release creation."
        print_info "Run: gh auth login"
        return 0
    fi
    
    print_info "Creating GitHub release..."
    
    # Create temporary file for release notes
    local notes_file=$(mktemp)
    echo "$release_notes" > "$notes_file"
    
    if gh release create "$tag" --title "$tag" --notes-file "$notes_file"; then
        print_success "GitHub release created: $tag"
    else
        print_error "Failed to create GitHub release"
        rm "$notes_file"
        return 1
    fi
    
    rm "$notes_file"
}

# Main release function
release() {
    local version_type=$1
    local specific_version=$2
    
    echo "=========================================="
    echo "Mnemora Release"
    echo "=========================================="
    echo ""
    
    # Determine target version
    local target_version
    if [ -n "$specific_version" ]; then
        target_version="$specific_version"
        validate_version "$target_version"
    else
        if [ -z "$version_type" ]; then
            print_error "Please specify version type (major/minor/patch) or specific version"
            echo ""
            echo "Usage:"
            echo "  ./scripts/release.sh patch|minor|major"
            echo "  ./scripts/release.sh version 1.2.3"
            exit 1
        fi
        target_version=$(bump_version "$version_type")
    fi
    
    local current_version=$(get_current_version)
    local tag="v${target_version}"
    
    echo "Current version: $current_version"
    echo "Target version:  $target_version"
    echo "Tag:            $tag"
    echo ""
    
    # Check prerequisites
    print_info "Checking prerequisites..."
    
    # Check git
    if ! command -v git &> /dev/null; then
        print_error "Git not installed"
        exit 1
    fi
    print_success "Git installed"
    
    # Check if we're in a git repo
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not a git repository"
        exit 1
    fi
    
    # Check if working directory is clean
    check_git_clean
    print_success "Working directory is clean"
    
    # Check if tag already exists
    if git rev-parse "$tag" >/dev/null 2>&1; then
        print_error "Tag $tag already exists"
        exit 1
    fi
    
    # Check if we're on main/master branch
    local current_branch=$(git branch --show-current)
    if [[ "$current_branch" != "main" && "$current_branch" != "master" ]]; then
        print_info "Warning: Not on main/master branch (currently on: $current_branch)"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Generate structured release notes
    print_info "Generating release notes..."
    local release_notes=$(generate_release_notes "$target_version" "$(date +%Y-%m-%d)")
    if [ -z "$release_notes" ]; then
        print_error "Failed to generate release notes"
        exit 1
    fi
    print_success "Release notes generated"
    
    # Update CHANGELOG.md
    print_info "Updating CHANGELOG.md..."
    update_changelog "$target_version" "$release_notes" || {
        print_error "Failed to update CHANGELOG.md"
        exit 1
    }
    
    # Update package.json version
    print_info "Updating package.json version..."
    node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '$target_version';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
    print_success "Version updated in package.json"
    
    # Commit version bump and changelog
    print_info "Committing version bump and changelog..."
    git add package.json CHANGELOG.md 2>/dev/null || git add package.json
    git commit -m "chore: bump version to $target_version" || {
        print_error "Failed to commit version bump"
        exit 1
    }
    print_success "Version bump and changelog committed"
    
    # Create git tag
    print_info "Creating git tag..."
    git tag -a "$tag" -m "Release $tag

$release_notes" || {
        print_error "Failed to create git tag"
        exit 1
    }
    print_success "Git tag created: $tag"
    
    # Push commits and tags
    print_info "Pushing to remote..."
    git push || {
        print_error "Failed to push commits"
        exit 1
    }
    git push origin "$tag" || {
        print_error "Failed to push tag"
        exit 1
    }
    print_success "Pushed to remote"
    
    # Create GitHub release
    echo ""
    create_github_release "$tag" "$release_notes"
    
    echo ""
    echo "=========================================="
    print_success "RELEASE COMPLETE: $tag"
    echo "=========================================="
    echo ""
    echo "Next steps:"
    echo "1. Review the release at: https://github.com/$(git config --get remote.origin.url | sed -E 's/.*github.com[:/](.*)\.git/\1/')/releases/tag/$tag"
    echo "2. Deploy to production: yarn deploy"
    echo ""
}

# Parse arguments
if [ "$1" == "version" ]; then
    if [ -z "$2" ]; then
        print_error "Please specify a version number"
        exit 1
    fi
    release "" "$2"
else
    release "$1" ""
fi

