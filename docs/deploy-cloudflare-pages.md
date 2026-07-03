# Cloudflare Pages deployment

This repository deploys the `baby-food-cube-management` Cloudflare Pages project when `main` is pushed. A merged pull request to `main` triggers `.github/workflows/deploy-cloudflare-pages.yml`, which installs dependencies, runs tests, builds `dist`, checks that Cloudflare credentials are present, and deploys with Wrangler.

## Required GitHub secrets

Add these repository secrets in GitHub under Settings > Secrets and variables > Actions:

- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID for the Pages project.
- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token with Account > Cloudflare Pages > Edit permission.

The workflow only passes these values as environment variables to Wrangler. It does not print or store the secret values.

## Cost posture

As checked against the GitHub Actions billing docs on 2026-07-04, standard GitHub-hosted runners are free for public repositories. Private repositories receive included minutes and storage according to the account plan, and usage beyond the included allowance can be billed. This workflow uses one standard Ubuntu job, no uploaded artifacts, and no dependency cache to keep usage small and predictable.

## Zero GitHub Actions minutes alternative

If you want to avoid GitHub Actions minutes entirely, use Cloudflare Pages Git integration instead:

1. In Cloudflare, go to Workers & Pages > Create application > Pages > Connect to Git.
2. Select the GitHub repository.
3. Set Production branch to `main`.
4. Set Build command to `npm run build`.
5. Set Build output directory to `dist`.
6. Set the root directory to the repository root. If this repository is later moved into a monorepo, set the root directory to the app subdirectory.

Cloudflare Pages Git integration automatically builds and deploys connected GitHub/GitLab repositories on push. If the existing Pages project is tied to a Direct Upload workflow and cannot be converted cleanly, keep the GitHub Actions direct upload workflow or recreate the Pages project as Git-integrated.
