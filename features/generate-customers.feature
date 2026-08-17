@generate-customers @datadriven
Feature: Generate customers and accounts from examples
  As a bank manager
  I want to create customers and accounts from example rows
  So that test data volumes can be driven from the feature file without reusing a saved session

  Background:
    Given I launch the core banking application
    When I sign in with valid credentials
    Then I should be logged into the application
    And I open the bank manager portal

  @positive @regression
  Scenario Outline: Generate customers and accounts from examples
    When I add <customerCount> customers with random data
    And I view the created customers in the customers list
    Then <customerCount> customers should be visible in the customers list
    When I open <accountCount> accounts for each created customer
    Then <accountCount> accounts should be created for each customer

    Examples:
      | customerCount | accountCount |
      | 1             | 2            |
