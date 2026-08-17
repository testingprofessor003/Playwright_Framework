@customer
Feature: Create customers and accounts
  As a bank manager
  I want to create customers, search them, and open accounts
  So that banking test data can be generated and validated from the feature file

  Background:
    Given I launch the core banking application
    And I reuse the saved bank manager session
    And I open the bank manager portal

  @smoke @positive
  Scenario: Create a single customer with random data
    When I add a new customer
    And I view the created customer in the customers list
    Then the created customer should be visible in the customers list

  @positive @accounts @regression
  Scenario: Create a customer and open one account
    When I add a new customer
    And I view the created customer in the customers list
    Then the created customer should be visible in the customers list
    When I open 1 account for the created customer
    Then 1 account should be created for the customer

  @boundary @positive
  Scenario: Create the minimum of one customer and one account
    When I add 1 customer with random data
    And I view the created customers in the customers list
    Then 1 customer should be visible in the customers list
    When I open 1 account for each created customer
    Then 1 account should be created for each customer

  @boundary @positive @accounts
  Scenario: Open accounts in all supported currencies for one customer
    When I add 1 customer with random data
    And I view the created customers in the customers list
    Then 1 customer should be visible in the customers list
    When I open 3 accounts for each created customer
    Then 3 accounts should be created for each customer

  @positive @accounts
  Scenario Outline: Open an account in each supported currency
    When I add a new customer
    And I open an account for the created customer in "<currency>" with deposit "<amount>"
    Then 1 account should be created for the customer

    Examples:
      | currency | amount |
      | Dollar   | 1000   |
      | Pound    | 2500   |
      | Rupee    | 50000  |

  @positive @customer-login
  Scenario: Login to the created customer account
    When I add a new customer
    And I open 1 account for the created customer
    And I login to the created customer account
    Then I should be logged in as the created customer

  @positive @search
  Scenario: Search finds a newly created customer
    When I add a new customer
    And I view the created customer in the customers list
    Then the created customer should be visible in the customers list

  @negative @search
  Scenario: Search does not find an unknown customer
    When I search customers for "ZZZNoSuchCustomer999"
    Then no customer named "ZZZNoSuchCustomer999" should be visible

  @negative @validation
  Scenario: Cannot add a customer when all fields are empty
    When I open the add customer form
    And I submit the add customer form without filling details
    Then the add customer form should remain invalid

  @negative @validation
  Scenario Outline: Cannot add a customer with an invalid <field>
    When I open the add customer form
    And I try to add a customer with invalid <field> "<value>"
    Then the add customer form should remain invalid

    Examples:
      | field     | value        |
      | email     | not-an-email |
      | firstName |              |
      | lastName  |              |

  @negative @duplicate
  Scenario: Cannot add the same customer twice
    When I add a new customer
    And I add the same customer again
    Then a duplicate customer should not be created
