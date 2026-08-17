@full-journey
Feature: Core banking full journey
  As a bank manager and customer
  I want to complete the entire application flow end to end
  So that login, manager portal, customer list, account opening, customer login, deposit, and withdraw screens are all exercised

  Background:
    Given I launch the core banking application
    When I sign in with valid credentials
    Then I should be logged into the application
    And I open the bank manager portal

  @smoke @positive @regression
  Scenario: Complete journey across all application screens
    When I add a new customer
    And I view the created customer in the customers list
    Then the created customer should be visible in the customers list
    When I open 1 account for the created customer
    Then 1 account should be created for the customer
    When I login to the created customer account
    Then I should be logged in as the created customer
    When I deposit a random amount into the created customer account
    Then the deposit should be completed
    When I withdraw the deposited amount from the created customer account
    Then the withdrawal should be completed
