@smoke @example
Feature: Example template scenario
  As an automation engineer
  I want a working template scenario
  So that I can copy this pattern when adding real application pages

  Scenario: Open the application and verify the page loads
    Given I open the application
    And I store the page title in the shared buffer as "exampleTitle"
    Then the page title should not be empty
    And the shared buffer key "exampleTitle" should not be empty

  Scenario: Shared buffer is readable from global scope
    Given I open the application
    When I read the global shared buffer key "exampleTitle"
    Then the last shared value should exist
