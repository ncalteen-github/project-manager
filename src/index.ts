import * as core from '@actions/core'
import * as github from '@actions/github'

import {getNodeId, TYPES} from './utils'

async function run(): Promise<void> {
  let response: any

  try {
    // Get the action inputs
    const projectNumber = parseInt(core.getInput('projectNumber'))
    const owner = core.getInput('owner')
    const repository = core.getInput('repository')
    const username = core.getInput('username')

    // Log inputs
    core.info(`Project: ${projectNumber}`)
    core.info(`Repository: ${owner}/${repository}`)
    core.info(`Username: ${username}`)

    // Get the event context
    const context = github.context

    // Create the Octokit client
    const octokit = github.getOctokit(core.getInput('token'))

    // Get the project's global ID
    const projectId = await getNodeId(
      TYPES.PROJECT,
      owner,
      repository,
      projectNumber,
      projectNumber
    )
    core.info(`Project ID: ${projectId}`)

    // Get the user's global ID
    const userId = await getNodeId(
      TYPES.USER,
      owner,
      repository,
      projectNumber,
      username
    )
    core.info(`User ID: ${userId}`)

    // New issue created
    const issueNumber = context.issue.number

    // Get the issue's global ID
    const issueId = await getNodeId(
      TYPES.ISSUE,
      owner,
      repository,
      projectNumber,
      issueNumber
    )
    core.info(`Issue ID: ${issueId}`)

    // Add it to the project
    response = await octokit.graphql({
      query: `
        mutation ($projectId: ID!, $issueId: ID!) {
          addProjectV2ItemById(input: {projectId: $projectId, contentId: $issueId}) {
            item {
              id
              type
            }
          }
        }
      `,
      projectId,
      issueId
    })

    if (response.errors) {
      core.error(response.errors)
      throw new Error('Add Issue to Project Error!')
    }

    // Adding the issue generates an item ID
    const itemId = response.addProjectV2ItemById.item.id
    core.info(`Item ID: ${itemId}`)

    // Get the Inbox column ID
    // This is an option in the `Status` single-select field option
    const fieldId = await getNodeId(
      TYPES.FIELD,
      owner,
      repository,
      projectNumber,
      projectNumber
    )
    const optionId = await getNodeId(
      TYPES.OPTION,
      owner,
      repository,
      projectNumber,
      'Inbox'
    )
    core.info(`Status Field ID: ${fieldId}`)
    core.info(`Status Option ID: ${optionId}`)

    // Move the item to the Inbox column
    response = octokit.graphql({
      query: `
        mutation ($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId,
            itemId: $itemId,
            fieldId: $fieldId,
            value: {
                singleSelectOptionId: $optionId
            }
          })
          {
            projectV2Item {
              id
            }
          }
        }
      `,
      projectId,
      itemId,
      fieldId,
      optionId
    })

    if (response.errors) {
      // Something went wrong...
      core.error(response.errors)
      throw new Error('Move Issue To Inbox Error!')
    }

    // Assign the issue to the user
    response = await octokit.graphql({
      query: `
        mutation ($issueId: ID!, $userId: ID!) {
          addAssigneesToAssignable(input: {assignableId: $issueId, assigneeIds: [$userId]}) {
            assignable {
              ... on Issue {
                number
              }
            }
          }
        }
      `,
      issueId,
      userId
    })

    if (response.errors) {
      // Something went wrong...
      core.error(response.errors)
      throw new Error('Assign Issue to User Error!')
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
